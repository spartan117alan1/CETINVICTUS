#pragma once
#include <stdbool.h>

typedef struct {
  int pin;
  bool active_high;
  bool on;
} led_t;

void led_init(led_t *led, int pin, bool active_high);
void led_set(led_t *led, bool on);
void led_toggle(led_t *led);
bool led_is_on(const led_t *led);