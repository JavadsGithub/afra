use serde::{Deserialize, Serialize};

// Pin data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pin {
    pub id: f64,
    pub lat: f64,
    pub lng: f64,
    pub depth: f64,
    pub speed: f64,
    pub under_water_time: f64,
    pub mission_time: f64,
}

impl Pin {
    pub fn new(
        id: f64,
        lat: f64,
        lng: f64,
        depth: f64,
        speed: f64,
        under_water_time: f64,
        mission_time: f64,
    ) -> Self {
        Self {
            id,
            lat,
            lng,
            depth,
            speed,
            under_water_time,
            mission_time,
        }
    }
}