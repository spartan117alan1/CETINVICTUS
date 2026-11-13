#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  int pin;
  bool stable, last;
  int64_t t_change;
} fc51_t;

void fc51_init(fc51_t *sensor, int pin);
bool fc51_detected(fc51_t *sensor);