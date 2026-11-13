#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "freertos/FreeRTOS.h"

typedef struct {
  int pin;
  portMUX_TYPE mux;
  bool converting;
  int64_t t_start;
  uint8_t errs;
  float last;
} ds18b20_t;

void ds18b20_init(ds18b20_t *sensor, int gpio);
float ds18b20_read(ds18b20_t *sensor);