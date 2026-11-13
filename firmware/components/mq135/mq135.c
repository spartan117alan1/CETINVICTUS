#include <math.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "mq135.h"

#define SAMPLES 32
#define WARMUP_US (180LL * 1000000)
#define V_MIN_OK 0.05f
#define V_MAX_OK 4.8f
#define PARA 116.6020682f
#define PARB 2.769034857f
#define PPM_MAX 10000.f

#define LOG_CALIBRATION 1
#define CAL_AIR_PPM 420.f

static const char *TAG = "mq135";

static float clampf(float x, float lo, float hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

static float correction(float t, float h) {
  t = clampf(t, 0.f, 50.f);
  h = clampf(h, 20.f, 90.f);
  if(t < 20.f) return 0.00035f * t * t - 0.02718f * t + 1.39538f - (h - 33.f) * 0.0018f;
  return -0.003333333f * t - 0.001923077f * h + 1.130128205f;
}

esp_err_t mq135_init(mq135_t *sensor, int pin, float divider, float vcc, float rl_ohm, float r0_ohm) {
  sensor->divider = divider;
  sensor->vcc = vcc;
  sensor->rl_ohm = rl_ohm;
  sensor->r0_ohm = r0_ohm;
  sensor->t_start = esp_timer_get_time();
  sensor->reading = (mq135_reading_t){ .volts = NAN, .rs_ohm = NAN, .ppm = NAN, .status = MQ135_FAULT };
  return adc_input_init(&sensor->adc, pin);
}

void mq135_update(mq135_t *sensor, float temp_c, float hum_pct) {
  int64_t now = esp_timer_get_time();
  mq135_reading_t *reading = &sensor->reading;

  int mv = adc_input_read_mv(&sensor->adc, SAMPLES);
  if(mv < 0) {
    reading->volts = reading->rs_ohm = reading->ppm = NAN;
    reading->status = MQ135_FAULT;
    return;
  }

  float volts = mv / 1000.f / sensor->divider;
  reading->volts = volts;

  if(volts < V_MIN_OK || volts > V_MAX_OK || volts >= sensor->vcc) {
    reading->rs_ohm = reading->ppm = NAN;
    reading->status = MQ135_FAULT;
    return;
  }

  float rs = sensor->rl_ohm * (sensor->vcc - volts) / volts;
  reading->rs_ohm = rs;

  bool compensated = !isnan(temp_c) && !isnan(hum_pct);
  float corr = compensated ? correction(temp_c, hum_pct) : 1.f;
  float rs_corr = rs / corr;

  if(now - sensor->t_start < WARMUP_US) {
    reading->ppm = NAN;
    reading->status = MQ135_WARNING;
    return;
  }

  #if LOG_CALIBRATION
    static int64_t t_log;
    if(now - t_log >= 30000000) {
      t_log = now;
      float r0_est = rs_corr * powf(CAL_AIR_PPM / PARA, 1.f / PARB);
      ESP_LOGI(TAG, "Rs=%.0f ohm | R0 estimado (aire a %.0f ppm) = %.0f ohm", rs_corr, CAL_AIR_PPM, r0_est);
    }
  #endif

  float ppm = PARA * powf(rs_corr / sensor->r0_ohm, -PARB);
  reading->ppm = clampf(ppm, 0.f, PPM_MAX);
  reading->status = compensated ? MQ135_OK : MQ135_WARNING;
}

mq135_reading_t mq135_get(const mq135_t *sensor) {
  return sensor->reading;
}