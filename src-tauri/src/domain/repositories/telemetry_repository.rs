use crate::Telemetry;
use async_trait::async_trait;

#[async_trait]
pub trait TelemetryRepository: Send + Sync {
    async fn save_telemetries(
        &self,
        telemetries: Vec<Telemetry>,
    ) -> Result<(), Box<dyn std::error::Error>>;
    async fn load_telemetries(&self) -> Result<Vec<Telemetry>, Box<dyn std::error::Error>>;
    async fn delete_telemetry(&self, id: f64) -> Result<bool, Box<dyn std::error::Error>>;
    async fn clear_all_telemetries(&self) -> Result<(), Box<dyn std::error::Error>>;
}
