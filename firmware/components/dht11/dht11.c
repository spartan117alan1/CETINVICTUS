#include <math.h>
#include <string.h>
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "dht11.h"

#define MIN_PERIOD_US 1500000 
#define START_LOW_MS 25 
#define BIT_ONE_US 40
#define MAX_ERRS 3

static int wait_while(int pin, int level, int timeout_us) {
  int64_t t0 = esp_timer_get_time();
  while(gpio_get_level(pin) == level) {
    if(esp_timer_get_time() - t0 > timeout_us) return -1;
  }

  return (int)(esp_timer_get_time() - t0);
}

static bool read_raw(dht11_t *sensor, uint8_t d[5]) {
  gpio_set_level(sensor->pin, 0);
  vTaskDelay(pdMS_TO_TICKS(START_LOW_MS));

  bool ok = false;
  memset(d, 0, 5);

  portENTER_CRITICAL(&sensor->mux);
  gpio_set_level(sensor->pin, 1);
  esp_rom_delay_us(10);

  do {
    if(wait_while(sensor->pin, 1, 100) < 0) break;
    if(wait_while(sensor->pin, 0, 120) < 0) break;
    if(wait_while(sensor->pin, 1, 120) < 0) break;

    int i;
    for(i = 0; i < 40; ++i) {
      if(wait_while(sensor->pin, 0, 100) < 0) break;
      int high = wait_while(sensor->pin, 1, 100);
      if(high < 0) break;
      d[i / 8] <<= 1;
      if(high > BIT_ONE_US) d[i / 8] |= 1;
    }

    ok = (i == 40);
  } while(0);

  portEXIT_CRITICAL(&sensor->mux);
  return ok && (uint8_t)(d[0] + d[1] + d[2] + d[3]) == d[4];
}

esp_err_t dht11_init(dht11_t *sensor, int pin) {
  sensor->pin = pin;
  portMUX_INITIALIZE(&sensor->mux);
  sensor->errs = 0;
  sensor->reading = (dht11_reading_t){ .temp_c = NAN, .humidity = NAN, .status = DHT11_FAULT };
  sensor->t_last = esp_timer_get_time();

  gpio_config_t cfg = {
    .pin_bit_mask = 1ULL << pin,
    .mode = GPIO_MODE_INPUT_OUTPUT_OD,
    .pull_up_en = GPIO_PULLUP_ENABLE,
  };

  esp_err_t r = gpio_config(&cfg);
  if(r != ESP_OK) return r;
  return gpio_set_level(pin, 1);
}

void dht11_update(dht11_t *sensor) {
  int64_t now = esp_timer_get_time();
  if(now - sensor->t_last < MIN_PERIOD_US) return;
  
  sensor->t_last = now;
  uint8_t d[5];
  dht11_reading_t *reading = &sensor->reading;

  if(read_raw(sensor, d)) {
    float h = d[0] + d[1] * 0.1f;
    float t = d[2] + (d[3] & 0x7F) * 0.1f;
    if(d[3] & 0x80) t = -t;

    reading->humidity = h;
    reading->temp_c = t;
    sensor->errs = 0;

    bool in_spec = t >= 0.f && t <= 50.f && h >= 20.f && h <= 90.f;
    reading->status = in_spec ? DHT11_OK : DHT11_WARNING;
    return;
  }

  if(sensor->errs < MAX_ERRS) sensor->errs++;
  if(sensor->errs >= MAX_ERRS) {
    reading->temp_c = reading->humidity = NAN;
    reading->status = DHT11_FAULT;
  }
}

dht11_reading_t dht11_get(const dht11_t *sensor) {
  return sensor->reading;
}