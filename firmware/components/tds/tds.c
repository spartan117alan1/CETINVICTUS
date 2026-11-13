#include <math.h>
#include "tds.h"

#define SAMPLES 32
#define V_MAX_OK 2.4f
#define PPM_MAX_SPEC 1000.f
#define TEMP_REF_C 25.f
#define TEMP_COEF 0.02f

esp_err_t tds_init(tds_t *sensor, int pin, float k) {
  sensor->k = k;
  sensor->reading = (tds_reading_t){ .volts = NAN, .ppm = NAN, .status = TDS_FAULT };
  return adc_input_init(&sensor->adc, pin);
}

void tds_update(tds_t *sensor, float temp_c) {
  tds_reading_t *reading = &sensor->reading;

  int mv = adc_input_read_mv(&sensor->adc, SAMPLES);
  if(mv < 0) {
    reading->volts = reading->ppm = NAN;
    reading->status = TDS_FAULT;
    return;
  }

  float value = mv / 1000.f;
  reading->volts = value;

  if(value > V_MAX_OK) {
    reading->ppm = NAN;
    reading->status = TDS_FAULT;
    return;
  }

  bool compensated = !isnan(temp_c) && temp_c > -10.f && temp_c < 80.f;
  float temp = compensated ? temp_c : TEMP_REF_C;
  float cv = value / (1.f + TEMP_COEF * (temp - TEMP_REF_C));
  float ppm = (133.42f * cv * cv * cv - 255.86f * cv * cv + 857.39f * cv) * 0.5f * sensor->k;

  reading->ppm = fmaxf(ppm, 0.f);
  reading->status = (!compensated || reading->ppm > PPM_MAX_SPEC) ? TDS_WARNING : TDS_OK;
}

tds_reading_t tds_get(const tds_t *sensor) {
  return sensor->reading;
}