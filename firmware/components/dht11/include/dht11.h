#pragma once
#include <stdint.h>
#include "esp_err.h"
#include "freertos/FreeRTOS.h"

typedef enum { DHT11_OK = 0, DHT11_WARNING = 1, DHT11_FAULT = 2 } dht11_status_t;

typedef struct {
  float temp_c;
  float humidity;
  dht11_status_t status;
} dht11_reading_t;

typedef struct {
  int pin;
  portMUX_TYPE mux;
  int64_t t_last;
  uint8_t errs;
  dht11_reading_t reading;
} dht11_t;

esp_err_t dht11_init(dht11_t *sensor, int pin);
void dht11_update(dht11_t *sensor);
dht11_reading_t dht11_get(const dht11_t *sensor);