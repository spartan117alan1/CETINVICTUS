#pragma once
#include <stdint.h>
#include "esp_err.h"
#include "driver/pulse_cnt.h"

typedef struct {
  pcnt_unit_handle_t unit;
  float pulses_per_l;     // 450 de fábrica; calibra con un volumen conocido
  int last_count;
  int64_t t_last;
  uint32_t total_pulses;
  float lpm;
} yfs201_t;

esp_err_t yfs201_init(yfs201_t *sensor, int pin, float pulses_per_l);
void yfs201_update(yfs201_t *sensor);
float yfs201_lpm(const yfs201_t *sensor);
float yfs201_total_l(const yfs201_t *sensor);   