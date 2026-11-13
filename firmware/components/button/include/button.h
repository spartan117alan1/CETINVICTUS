#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  int pin;
  bool stable, last;
  int64_t t_change;
} button_t;

void button_init(button_t *btn, int pin);
bool button_pressed(button_t *btn);
bool button_is_down(const button_t *btn);