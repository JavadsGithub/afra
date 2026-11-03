use crate::domain::entities::auth::{AuthState, PasswordAgeInfo};
use serde_json;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const AUTH_FILE_NAME: &str = "auth_config.json";
const DEFAULT_INTERVAL_DAYS: u32 = 7;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct AuthConfig {
    password_hash: Option<String>,
    #[serde(default)]
    password_last_changed_at: Option<u64>,
    #[serde(default = "default_interval")]
    password_change_interval_days: u32,
}

fn default_interval() -> u32 {
    DEFAULT_INTERVAL_DAYS
}

pub struct AuthUseCase {
    data_dir: PathBuf,
    is_authenticated: AtomicBool,
}

impl AuthUseCase {
    pub fn new() -> Self {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("tauri-app");

        if !data_dir.exists() {
            let _ = fs::create_dir_all(&data_dir);
        }

        Self {
            data_dir,
            is_authenticated: AtomicBool::new(false),
        }
    }

    fn auth_config_path(&self) -> PathBuf {
        self.data_dir.join(AUTH_FILE_NAME)
    }

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    fn load_config(&self) -> Result<AuthConfig, String> {
        let path = self.auth_config_path();
        if path.exists() {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())
        } else {
            Ok(AuthConfig {
                password_hash: None,
                password_last_changed_at: None,
                password_change_interval_days: DEFAULT_INTERVAL_DAYS,
            })
        }
    }

    fn save_config(&self, config: &AuthConfig) -> Result<(), String> {
        let path = self.auth_config_path();
        let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    }

    fn hash_password(password: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let result = hasher.finalize();
        format!("{:x}", result)
    }

    pub fn get_auth_state(&self) -> Result<AuthState, String> {
        let config = self.load_config()?;
        Ok(AuthState {
            is_authenticated: self.is_authenticated.load(Ordering::SeqCst),
            has_password: config.password_hash.is_some(),
        })
    }

    pub fn set_password(&self, password: &str) -> Result<(), String> {
        if password.is_empty() {
            return Err("Password cannot be empty".to_string());
        }

        let mut config = self.load_config()?;
        config.password_hash = Some(Self::hash_password(password));
        config.password_last_changed_at = Some(Self::now_secs());
        self.save_config(&config)?;
        self.is_authenticated.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn login(&self, password: &str) -> Result<bool, String> {
        let config = self.load_config()?;

        let password_hash = match &config.password_hash {
            Some(hash) => hash,
            None => return Err("No password has been set".to_string()),
        };

        let input_hash = Self::hash_password(password);

        if input_hash == *password_hash {
            self.is_authenticated.store(true, Ordering::SeqCst);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn logout(&self) {
        self.is_authenticated.store(false, Ordering::SeqCst);
    }

    pub fn change_password(&self, old_password: &str, new_password: &str) -> Result<(), String> {
        let config = self.load_config()?;

        let password_hash = match &config.password_hash {
            Some(hash) => hash,
            None => return Err("No password has been set".to_string()),
        };

        let input_hash = Self::hash_password(old_password);
        if input_hash != *password_hash {
            return Err("Current password is incorrect".to_string());
        }

        if new_password.is_empty() {
            return Err("New password cannot be empty".to_string());
        }

        let mut config = config;
        config.password_hash = Some(Self::hash_password(new_password));
        config.password_last_changed_at = Some(Self::now_secs());
        self.save_config(&config)?;
        Ok(())
    }

    pub fn get_password_age_info(&self) -> Result<PasswordAgeInfo, String> {
        let config = self.load_config()?;
        let now = Self::now_secs();
        let days_since_change = config.password_last_changed_at.map(|ts| {
            let secs = now.saturating_sub(ts);
            secs / 86400
        });
        let is_expired = match (days_since_change, config.password_change_interval_days) {
            (Some(_), 0) => true,
            (Some(days), interval) if interval > 0 => days >= interval as u64,
            _ => false,
        };
        Ok(PasswordAgeInfo {
            last_changed_at: config.password_last_changed_at,
            days_since_change,
            interval_days: config.password_change_interval_days,
            is_expired,
        })
    }

    pub fn set_password_change_interval(&self, days: u32) -> Result<(), String> {
        let mut config = self.load_config()?;
        config.password_change_interval_days = days;
        self.save_config(&config)?;
        Ok(())
    }

    pub fn is_authenticated(&self) -> bool {
        self.is_authenticated.load(Ordering::SeqCst)
    }
}
