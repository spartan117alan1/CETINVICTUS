#pragma once
#include <stdint.h>
#include "esp_err.h"
#include "adc_input.h"

typedef enum { TSW20_OK = 0, TSW20_WARNING = 1, TSW20_FAULT = 2 } tsw20_status_t;

typedef struct {
  float volts;
  float ntu;
  float lens_pct;
  tsw20_status_t status;
} tsw20_reading_t;

typedef struct {
  adc_input_t adc;
  float divider;
  float clear_v;
  float baseline_v;
  int64_t t_update;
  tsw20_reading_t reading;
} tsw20_t;

esp_err_t tsw20_init(tsw20_t *s, int pin, float divider, float clear_v);
void tsw20_update(tsw20_t *s);
tsw20_reading_t tsw20_get(const tsw20_t *s);