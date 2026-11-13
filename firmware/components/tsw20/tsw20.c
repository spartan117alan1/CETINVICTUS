// components/tsw20/tsw20.c
#include <math.h>
#include "esp_timer.h"
#include "tsw20.h"

#define SAMPLES 16
#define V_MIN_OK 0.3f
#define V_MAX_OK 4.8f
#define V_RANGE_LOW 2.5f
#define LENS_WARN_PCT 85.f
#define BASELINE_DECAY_V_PER_H 0.01f

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }

static float volts_to_ntu(float value) {
  if(value >= 4.2f) return 0.f;
  value = fmaxf(value, V_RANGE_LOW);
  return -1120.4f * value * value + 5742.3f * value - 4352.9f;
}

esp_err_t tsw20_init(tsw20_t *sensor, int pin, float divider, float clear_v) {
  sensor->divider = divider;
  sensor->clear_v = clear_v;
  sensor->baseline_v = clear_v;
  sensor->t_update = 0;
  sensor->reading = (tsw20_reading_t){ .volts = NAN, .ntu = NAN, .lens_pct = 100.f, .status = TSW20_FAULT };
  return adc_input_init(&sensor->adc, pin);
}

void tsw20_update(tsw20_t *sensor) {
  int64_t now = esp_timer_get_time();
  tsw20_reading_t *reading = &sensor->reading;

  int mv = adc_input_read_mv(&sensor->adc, SAMPLES);
  if(mv < 0) {
    reading->volts = reading->ntu = NAN;
    reading->status = TSW20_FAULT;
    return;
  }

  float value = mv / 1000.f / sensor->divider;
  reading->volts = value;

  if(sensor->t_update) sensor->baseline_v -= BASELINE_DECAY_V_PER_H * (float)(now - sensor->t_update) / 3.6e9f;
  sensor->t_update = now;
  if(value > sensor->baseline_v) sensor->baseline_v = value;
  reading->lens_pct = clampf(sensor->baseline_v / sensor->clear_v * 100.f, 0.f, 100.f);

  if(value < V_MIN_OK || value > V_MAX_OK) {
    reading->ntu = NAN;
    reading->status = TSW20_FAULT;
    return;
  }

  reading->ntu = volts_to_ntu(value);
  reading->status = (value < V_RANGE_LOW || reading->lens_pct < LENS_WARN_PCT) ? TSW20_WARNING : TSW20_OK;
}

tsw20_reading_t tsw20_get(const tsw20_t *sensor) {
  return sensor->reading;
}