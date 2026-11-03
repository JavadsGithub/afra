use crate::domain::entities::pin::Pin;
use crate::domain::repositories::pin_repository::PinRepository;
use std::sync::Arc;

pub struct PinManagementUseCase {
    pin_repository: Arc<dyn PinRepository>,
}

impl PinManagementUseCase {
    pub fn new(pin_repository: Arc<dyn PinRepository>) -> Self {
        Self { pin_repository }
    }

    pub async fn save_pins(&self, pins: Vec<Pin>) -> Result<(), Box<dyn std::error::Error>> {
        self.pin_repository.save_pins(pins).await
    }

    pub async fn load_pins(&self) -> Result<Vec<Pin>, Box<dyn std::error::Error>> {
        self.pin_repository.load_pins().await
    }

    pub async fn add_pin(&self, pin: Pin) -> Result<Pin, Box<dyn std::error::Error>> {
        self.pin_repository.add_pin(pin).await
    }

    pub async fn update_pin(&self, id: f64, pin: Pin) -> Result<bool, Box<dyn std::error::Error>> {
        self.pin_repository.update_pin(id, pin).await
    }

    pub async fn delete_pin(&self, id: f64) -> Result<bool, Box<dyn std::error::Error>> {
        self.pin_repository.delete_pin(id).await
    }

    pub async fn get_all_pins(&self) -> Result<Vec<Pin>, Box<dyn std::error::Error>> {
        self.pin_repository.get_all_pins().await
    }
}