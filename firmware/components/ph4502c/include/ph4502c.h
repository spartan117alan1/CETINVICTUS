#pragma once
#include <stdbool.h>
#include "esp_err.h"
#include "adc_input.h"

typedef enum { PH_OK = 0, PH_WARNING = 1, PH_FAULT = 2 } ph_status_t;

typedef struct {
  float volts;     // voltaje en Po (ya sin el divisor); NAN si el ADC falla
  float ph;        // NAN si hay falla
  ph_status_t status;
} ph_reading_t;

typedef struct {
  float volts;     // voltaje en Po medido con el buffer
  float ph;        // pH del buffer (ej. 4.00, 7.00)
} ph_cal_t;

typedef struct {
  adc_input_t adc;
  float divider;     // Vadc / Vpo (0.5 para 10k/10k)
  float v7;          // voltaje en Po a pH 7 (punto isopotencial)
  float slope;       // V por unidad de pH a cal_temp_c (con signo)
  float cal_temp_c;  // temperatura de los buffers al calibrar
  float v_filt;
  bool has_filt;
  ph_reading_t reading;
} ph4502c_t;

esp_err_t ph4502c_init(ph4502c_t *sensor, int pin, float divider, ph_cal_t a, ph_cal_t b, float cal_temp_c);
void ph4502c_update(ph4502c_t *ssensor, float temp_c);
ph_reading_t ph4502c_get(const ph4502c_t *ssensor);