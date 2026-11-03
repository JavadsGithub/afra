use crate::domain::entities::telemetry::Telemetry;
use crate::domain::repositories::telemetry_repository::TelemetryRepository;
use std::sync::Arc;

pub struct TelemetryManagementUseCase {
    telemetry_repository: Arc<dyn TelemetryRepository>,
}

impl TelemetryManagementUseCase {
    pub fn new(telemetry_repository: Arc<dyn TelemetryRepository>) -> Self {
        Self {
            telemetry_repository,
        }
    }

    pub async fn save_telemetries(
        &self,
        telemetries: Vec<Telemetry>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.telemetry_repository
            .save_telemetries(telemetries)
            .await
    }

    pub async fn load_telemetries(&self) -> Result<Vec<Telemetry>, Box<dyn std::error::Error>> {
        self.telemetry_repository.load_telemetries().await
    }

    pub async fn delete_telemetry(
        &self,
        timestamp: f64,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        self.telemetry_repository.delete_telemetry(timestamp).await
    }

    pub async fn clear_all_telemetries(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.telemetry_repository.clear_all_telemetries().await
    }
}
