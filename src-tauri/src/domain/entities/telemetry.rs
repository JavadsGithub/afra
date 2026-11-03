use serde::{Deserialize, Serialize};

/// Represents a single telemetry data which application must receive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Telemetry {
    /// Geographic coordinates
    pub latitude: f64,
    pub longitude: f64,

    /// Robot heading in degrees
    pub yaw: f64,

    /// Depth in meters
    pub depth: f64,

    /// Revolutions per second
    pub rps: f64,

    /// Current draw in amperes
    pub ampere: f64,

    /// Water time duration
    pub wtd: f64,

    /// Temperature reading
    pub temperature: f64,

    /// Timestamp of the telemetry reading (epoch seconds)
    pub timestamp: f64,

    /// Speed in knots
    pub speed: f64,

    /// Battery level percentage
    pub battery_level: f64,

    /// Mission identifier
    pub mission_id: f64,

    /// Robot status
    pub status: f64,

    /// Error
    pub error: f64,
}

impl Telemetry {
    pub fn new(
        latitude: f64,
        longitude: f64,
        yaw: f64,
        depth: f64,
        rps: f64,
        ampere: f64,
        wtd: f64,
        temperature: f64,
        timestamp: f64,
        speed: f64,
        battery_level: f64,
        mission_id: f64,
        status: f64,
        error: f64,
    ) -> Self {
        Self {
            latitude,
            longitude,
            yaw,
            depth,
            rps,
            ampere,
            wtd,
            temperature,
            timestamp,
            speed,
            battery_level,
            mission_id,
            status,
            error,
        }
    }
}
