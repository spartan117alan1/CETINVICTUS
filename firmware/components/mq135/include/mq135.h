#pragma once
#include <stdint.h>
#include "esp_err.h"
#include "adc_input.h"

typedef enum { MQ135_OK = 0, MQ135_WARNING = 1, MQ135_FAULT = 2 } mq135_status_t;

typedef struct {
  float volts;
  float rs_ohm;
  float ppm;
  mq135_status_t status;
} mq135_reading_t;

typedef struct {
  adc_input_t adc;
  float divider;
  float vcc;
  float rl_ohm;
  float r0_ohm;
  int64_t t_start;
  mq135_reading_t reading;
} mq135_t;

esp_err_t mq135_init(mq135_t *sensor, int pin, float divider, float vcc, float rl_ohm, float r0_ohm);
void mq135_update(mq135_t *sensor, float temp_c, float hum_pct);
mq135_reading_t mq135_get(const mq135_t *sensor);