//! Registro de marcas. El orden de `BRANDS` es el índice que usa el frontend.
//!
//! Para agregar una marca (p. ej. Siemens): crear `brands/siemens/mod.rs` con sus tablas,
//! implementar [`crate::Brand`] (puede tener otros tipos de arranque, extras y reglas) y
//! añadirla aquí.

pub mod abb;

use crate::Brand;

pub static BRANDS: &[&dyn Brand] = &[&abb::Abb];
