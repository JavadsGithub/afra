use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub is_authenticated: bool,
    pub has_password: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordAgeInfo {
    pub last_changed_at: Option<u64>,
    pub days_since_change: Option<u64>,
    pub interval_days: u32,
    pub is_expired: bool,
}
