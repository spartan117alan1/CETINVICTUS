#include "driver/gpio.h"
#include "led.h"

void led_init(led_t *led, int pin, bool active_high) {
  led->pin = pin;
  led->active_high = active_high;

  gpio_config_t cfg = {
    .pin_bit_mask = 1ULL << pin,
    .mode = GPIO_MODE_OUTPUT
  };

  ESP_ERROR_CHECK(gpio_config(&cfg));
  led_set(led, false);
}

void led_set(led_t *led, bool on) {
  led->on = on;
  gpio_set_level(led->pin, (on == led->active_high) ? 1 : 0);
}

void led_toggle(led_t *led) {
  led_set(led, !led->on);
}

bool led_is_on(const led_t *led) {
  return led->on;
}