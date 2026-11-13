#include <math.h>
#include "driver/gpio.h"
#include "esp_timer.h"
#include "yfs201.h"

#define PCNT_LIMIT 32767        // el contador de 16 bits se reinicia al llegar aquí
#define GLITCH_NS 10000         // ignora pulsos < 10 µs (ruido); a 225 Hz el periodo es 4.4 ms
#define MIN_WINDOW_US 200000    // ventana mínima para calcular caudal

esp_err_t yfs201_init(yfs201_t *sensor, int pin, float pulses_per_l) {
  sensor->pulses_per_l = pulses_per_l;
  sensor->last_count = 0;
  sensor->total_pulses = 0;
  sensor->lpm = 0.f;

  pcnt_unit_config_t ucfg = { .high_limit = PCNT_LIMIT, .low_limit = -1 };
  esp_err_t error = pcnt_new_unit(&ucfg, &sensor->unit);
  if(error != ESP_OK) return error;

  pcnt_glitch_filter_config_t fcfg = { .max_glitch_ns = GLITCH_NS };
  error = pcnt_unit_set_glitch_filter(sensor->unit, &fcfg);
  if(error != ESP_OK) return error;

  pcnt_chan_config_t ccfg = { .edge_gpio_num = pin, .level_gpio_num = -1 };
  pcnt_channel_handle_t chan;
  error = pcnt_new_channel(sensor->unit, &ccfg, &chan);
  if(error != ESP_OK) return error;

  error = pcnt_channel_set_edge_action(chan, PCNT_CHANNEL_EDGE_ACTION_INCREASE, PCNT_CHANNEL_EDGE_ACTION_HOLD);
  if(error != ESP_OK) return error;

  gpio_set_pull_mode(pin, GPIO_PULLUP_ONLY);

  if((error = pcnt_unit_enable(sensor->unit)) != ESP_OK) return error;
  if((error = pcnt_unit_clear_count(sensor->unit)) != ESP_OK) return error;
  if((error = pcnt_unit_start(sensor->unit)) != ESP_OK) return error;

  sensor->t_last = esp_timer_get_time();
  return ESP_OK;
}

void yfs201_update(yfs201_t *sensor) {
  int64_t now = esp_timer_get_time();
  int64_t dt_us = now - sensor->t_last;
  if(dt_us < MIN_WINDOW_US) return;

  int count;
  if(pcnt_unit_get_count(sensor->unit, &count) != ESP_OK) {
    sensor->lpm = NAN;
    return;
  }

  uint32_t delta = (uint32_t)((count - sensor->last_count + PCNT_LIMIT) % PCNT_LIMIT);
  sensor->last_count = count;
  sensor->t_last = now;
  sensor->total_pulses += delta;

  float hz = (float)delta / ((float)dt_us / 1e6f);
  sensor->lpm = hz * 60.f / sensor->pulses_per_l;   // con 450: hz / 7.5
}

float yfs201_lpm(const yfs201_t *sensor) {
  return sensor->lpm;
}

float yfs201_total_l(const yfs201_t *sensor) {
  return (float)sensor->total_pulses / sensor->pulses_per_l;
}