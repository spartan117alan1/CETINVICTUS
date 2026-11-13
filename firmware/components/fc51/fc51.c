#include "driver/gpio.h"
#include "esp_timer.h"
#include "fc51.h"

#define DEBOUNCE_US 50000

static bool raw_detected(const fc51_t *sensor) {
  return gpio_get_level(sensor->pin) == 0;
}

void fc51_init(fc51_t *sensor, int pin) {
  sensor->pin = pin;

  gpio_config_t cfg = {
    .pin_bit_mask = 1ULL << pin,
    .mode = GPIO_MODE_INPUT,
    .pull_up_en = GPIO_PULLUP_ENABLE,
  };

  ESP_ERROR_CHECK(gpio_config(&cfg));

  sensor->stable = sensor->last = raw_detected(sensor);
  sensor->t_change = esp_timer_get_time();
}

bool fc51_detected(fc51_t *sensor) {
  int64_t now = esp_timer_get_time();
  bool raw = raw_detected(sensor);

  if(raw != sensor->last) {
    sensor->last = raw;
    sensor->t_change = now;
  }

  if(raw != sensor->stable && (now - sensor->t_change) >= DEBOUNCE_US) {
    sensor->stable = raw;
  }

  return sensor->stable;
}