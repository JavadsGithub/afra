use crate::domain::entities::telemetry::Telemetry;
use crate::domain::repositories::telemetry_repository::TelemetryRepository;
use crate::infrastructure::utils::{get_data_dir, write_file};
use async_trait::async_trait;
use serde_json;
use std::fs;

pub struct FileTelemetryRepository;

impl FileTelemetryRepository {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl TelemetryRepository for FileTelemetryRepository {
    async fn save_telemetries(
        &self,
        telemetries: Vec<Telemetry>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir =
            get_data_dir().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let file_path = data_dir.join("telemetries.json");
        eprintln!("[repo] save {} items to {:?}", telemetries.len(), file_path);

        let json_content = match serde_json::to_string_pretty(&telemetries) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[repo] serialize error: {}", e);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())));
            }
        };
        eprintln!("[repo] json content length: {}", json_content.len());
        match write_file(&file_path, &json_content) {
            Ok(_) => eprintln!("[repo] write_file succeeded"),
            Err(e) => {
                eprintln!("[repo] write_file error: {}", e);
                return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)));
            }
        }
        eprintln!("[repo] save OK, file exists: {}, size: {}",
            file_path.exists(),
            std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0));
        Ok(())
    }

    async fn load_telemetries(&self) -> Result<Vec<Telemetry>, Box<dyn std::error::Error>> {
        let data_dir =
            get_data_dir().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let file_path = data_dir.join("telemetries.json");
        eprintln!("[repo] load from {:?}", file_path);

        if !file_path.exists() {
            eprintln!("[repo] file not found");
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(file_path)?;
        let telemetries: Vec<Telemetry> = serde_json::from_str(&content)?;
        eprintln!("[repo] loaded {} items", telemetries.len());
        Ok(telemetries)
    }

    async fn delete_telemetry(&self, timestamp: f64) -> Result<bool, Box<dyn std::error::Error>> {
        let mut telemetries = self.load_telemetries().await.unwrap_or_else(|_| Vec::new());
        let initial_len = telemetries.len();
        telemetries.retain(|t| t.timestamp != timestamp);

        let removed = telemetries.len() != initial_len;
        if removed {
            self.save_telemetries(telemetries).await?;
        }
        Ok(removed)
    }

    async fn clear_all_telemetries(&self) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir =
            get_data_dir().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let file_path = data_dir.join("telemetries.json");

        write_file(&file_path, "[]")
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        Ok(())
    }
}
