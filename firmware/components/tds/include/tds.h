#pragma once
#include "esp_err.h"
#include "adc_input.h"

typedef enum { TDS_OK = 0, TDS_WARNING = 1, TDS_FAULT = 2 } tds_status_t;

typedef struct {
  float volts;
  float ppm;
  tds_status_t status;
} tds_reading_t;

typedef struct {
  adc_input_t adc;
  float k; // factor de calibración (1.0 = curva de fábrica)
  tds_reading_t reading;
} tds_t;

esp_err_t tds_init(tds_t *sensor, int pin, float k);
void tds_update(tds_t *sensor, float temp_c);   // temp_c = NAN si no hay temperatura disponible
tds_reading_t tds_get(const tds_t *sensor);