#include <math.h>
#include "ph4502c.h"

#define SAMPLES 32
#define FILTER_ALPHA 0.3f
#define V_MIN_OK 0.2f
#define V_MAX_OK 4.8f
#define PH_WARN_LO 1.f
#define PH_WARN_HI 13.f
#define TEMP_REF_C 25.f

static float clampf(float x, float lo, float hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

esp_err_t ph4502c_init(ph4502c_t *sensor, int pin, float divider, ph_cal_t a, ph_cal_t b, float cal_temp_c) {
  if(a.ph == b.ph) return ESP_ERR_INVALID_ARG;

  float slope = (a.volts - b.volts) / (b.ph - a.ph);
  if(fabsf(slope) < 0.02f) return ESP_ERR_INVALID_ARG;

  sensor->divider = divider;
  sensor->slope = slope;
  sensor->v7 = b.volts + slope * (b.ph - 7.f);
  sensor->cal_temp_c = cal_temp_c;
  sensor->has_filt = false;
  sensor->reading = (ph_reading_t){ .volts = NAN, .ph = NAN, .status = PH_FAULT };
  return adc_input_init(&sensor->adc, pin);
}

void ph4502c_update(ph4502c_t *sensor, float temp_c) {
  ph_reading_t *reading = &sensor->reading;

  int mv = adc_input_read_mv(&sensor->adc, SAMPLES);
  if(mv < 0) {
    reading->volts = reading->ph = NAN;
    reading->status = PH_FAULT;
    sensor->has_filt = false;
    return;
  }

  float volts = mv / 1000.f / sensor->divider;

  if(volts < V_MIN_OK || volts > V_MAX_OK) {
    reading->volts = volts;
    reading->ph = NAN;
    reading->status = PH_FAULT;
    sensor->has_filt = false;
    return;
  }

  if(!sensor->has_filt) {
    sensor->v_filt = volts;
    sensor->has_filt = true;
  } else {
    sensor->v_filt += FILTER_ALPHA * (volts - sensor->v_filt);
  }

  reading->volts = sensor->v_filt;
  bool compensated = !isnan(temp_c) && temp_c > -5.f && temp_c < 80.f;
  float temp = compensated ? temp_c : TEMP_REF_C;

  float slope_t = sensor->slope * (temp + 273.15f) / (sensor->cal_temp_c + 273.15f);
  float ph = 7.f - (sensor->v_filt - sensor->v7) / slope_t;

  bool in_range = ph >= PH_WARN_LO && ph <= PH_WARN_HI;
  reading->ph = clampf(ph, 0.f, 14.f);
  reading->status = (compensated && in_range) ? PH_OK : PH_WARNING;
}

ph_reading_t ph4502c_get(const ph4502c_t *sensor) {
  return sensor->reading;
}