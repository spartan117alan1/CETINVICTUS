#include "driver/gpio.h"
#include "esp_timer.h"
#include "button.h"

#define DEBOUNCE_US 30000

static bool raw_down(const button_t *btn) {
  return gpio_get_level(btn->pin) == 0;
}

void button_init(button_t *btn, int pin) {
  btn->pin = pin;
  gpio_config_t cfg = {
    .pin_bit_mask = 1ULL << pin,
    .mode = GPIO_MODE_INPUT,
    .pull_up_en = GPIO_PULLUP_ENABLE,
  };

  ESP_ERROR_CHECK(gpio_config(&cfg));
  btn->stable = btn->last = raw_down(btn);
  btn->t_change = esp_timer_get_time();
}

bool button_pressed(button_t *btn) {
  int64_t now = esp_timer_get_time();
  bool raw = raw_down(btn);

  if(raw != btn->last) {
    btn->last = raw;
    btn->t_change = now;
  }

  if(raw != btn->stable && (now - btn->t_change) >= DEBOUNCE_US) {
    btn->stable = raw;
    return raw;
  }

  return false;
}

bool button_is_down(const button_t *btn) {
  return btn->stable;
}