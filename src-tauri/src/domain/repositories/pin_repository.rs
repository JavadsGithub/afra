use crate::domain::entities::pin::Pin;
use async_trait::async_trait;

#[async_trait]
pub trait PinRepository: Send + Sync {
    async fn save_pins(&self, pins: Vec<Pin>) -> Result<(), Box<dyn std::error::Error>>;
    async fn load_pins(&self) -> Result<Vec<Pin>, Box<dyn std::error::Error>>;
    async fn add_pin(&self, pin: Pin) -> Result<Pin, Box<dyn std::error::Error>>;
    async fn update_pin(&self, id: f64, pin: Pin) -> Result<bool, Box<dyn std::error::Error>>;
    async fn delete_pin(&self, id: f64) -> Result<bool, Box<dyn std::error::Error>>;
    async fn get_all_pins(&self) -> Result<Vec<Pin>, Box<dyn std::error::Error>>;
}