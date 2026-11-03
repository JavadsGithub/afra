use crate::domain::entities::pin::Pin;
use crate::domain::repositories::pin_repository::PinRepository;
use crate::infrastructure::utils::{get_data_dir, write_file};
use async_trait::async_trait;
use serde_json;
use std::fs;

pub struct FilePinRepository;

impl FilePinRepository {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl PinRepository for FilePinRepository {
    async fn save_pins(&self, pins: Vec<Pin>) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = get_data_dir().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let file_path = data_dir.join("pins.json");

        let json_content = serde_json::to_string_pretty(&pins)?;

        write_file(&file_path, &json_content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        Ok(())
    }

    async fn load_pins(&self) -> Result<Vec<Pin>, Box<dyn std::error::Error>> {
        let data_dir = get_data_dir().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let file_path = data_dir.join("pins.json");

        if !file_path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(file_path)?;
        let pins: Vec<Pin> = serde_json::from_str(&content)?;
        Ok(pins)
    }

    async fn add_pin(&self, pin: Pin) -> Result<Pin, Box<dyn std::error::Error>> {
        let mut pins = self.load_pins().await.unwrap_or_else(|_| Vec::new());
        pins.push(pin.clone());
        self.save_pins(pins).await?;
        Ok(pin)
    }

    async fn update_pin(&self, id: f64, pin: Pin) -> Result<bool, Box<dyn std::error::Error>> {
        let mut pins = self.load_pins().await.unwrap_or_else(|_| Vec::new());

        if let Some(existing_pin) = pins.iter_mut().find(|p| p.id == id) {
            *existing_pin = pin;
            self.save_pins(pins).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    async fn delete_pin(&self, id: f64) -> Result<bool, Box<dyn std::error::Error>> {
        let mut pins = self.load_pins().await.unwrap_or_else(|_| Vec::new());
        let initial_len = pins.len();
        pins.retain(|p| p.id != id);

        let removed = pins.len() != initial_len;

        if removed {
            self.save_pins(pins).await?;
        }

        Ok(removed)
    }

    async fn get_all_pins(&self) -> Result<Vec<Pin>, Box<dyn std::error::Error>> {
        self.load_pins().await
    }
}