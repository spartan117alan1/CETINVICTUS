#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "ds18b20.h"

#define CONV_US 750000
#define MAX_ERRS 3

static inline void bus_low(ds18b20_t *sensor) {
  gpio_set_level(sensor->pin, 0);
}

static inline void bus_release(ds18b20_t *sensor) {
  gpio_set_level(sensor->pin, 1);
}

static inline int  bus_read(ds18b20_t *sensor) {
  return gpio_get_level(sensor->pin);
}

static bool ow_reset(ds18b20_t *sensor) {
  bus_low(sensor);
  esp_rom_delay_us(480);

  portENTER_CRITICAL(&sensor->mux);
  bus_release(sensor);
  esp_rom_delay_us(70);
  int presence = !bus_read(sensor);
  portEXIT_CRITICAL(&sensor->mux);

  esp_rom_delay_us(410);
  return presence;
}

static void ow_write_bit(ds18b20_t *sensor, int bit) {
  portENTER_CRITICAL(&sensor->mux);
  bus_low(sensor);
  esp_rom_delay_us(bit ? 6 : 60);
  bus_release(sensor);
  portEXIT_CRITICAL(&sensor->mux);
  esp_rom_delay_us(bit ? 64 : 10);
}

static int ow_read_bit(ds18b20_t *sensor) {
  portENTER_CRITICAL(&sensor->mux);
  bus_low(sensor);
  esp_rom_delay_us(6);
  bus_release(sensor);
  esp_rom_delay_us(9);
  int bit = bus_read(sensor);
  portEXIT_CRITICAL(&sensor->mux);
  esp_rom_delay_us(55);
  return bit;
}

static void ow_write(ds18b20_t *sensor, uint8_t b) {
  for(int i = 0; i < 8; ++i, b >>= 1) ow_write_bit(sensor, b & 1);
}

static uint8_t ow_read(ds18b20_t *sensor) {
  uint8_t bit = 0;
  for(int i = 0; i < 8; ++i) bit |= (uint8_t)(ow_read_bit(sensor) << i);
  return bit;
}

static uint8_t crc8(const uint8_t *d, size_t n) {
  uint8_t crc = 0;
  while(n--) {
    uint8_t bit = *d++;
    for(int i = 0; i < 8; ++i, bit >>= 1) {
      uint8_t mix = (crc ^ bit) & 1;
      crc >>= 1;
      if(mix) crc ^= 0x8C;
    }
  }
  return crc;
}

static bool start_conversion(ds18b20_t *sensor) {
  if(!ow_reset(sensor)) return false;
  ow_write(sensor, 0xCC);
  ow_write(sensor, 0x44);
  return true;
}

static bool read_scratchpad(ds18b20_t *sensor, uint8_t sp[9]) {
  if(!ow_reset(sensor)) return false;
  ow_write(sensor, 0xCC);
  ow_write(sensor, 0xBE);
  for(int i = 0; i < 9; ++i) sp[i] = ow_read(sensor);
  return crc8(sp, 9) == 0;
}

static void fail(ds18b20_t *sensor) {
  if(sensor->errs < MAX_ERRS) sensor->errs++;
  if(sensor->errs >= MAX_ERRS) sensor->last = NAN;
}

void ds18b20_init(ds18b20_t *sensor, int pin) {
  sensor->pin = pin;
  portMUX_INITIALIZE(&sensor->mux);
  sensor->converting = false;
  sensor->t_start = 0;
  sensor->errs = 0;
  sensor->last = NAN;

  gpio_config_t cfg = {
    .pin_bit_mask = 1ULL << pin,
    .mode = GPIO_MODE_INPUT_OUTPUT_OD,
    .pull_up_en = GPIO_PULLUP_ENABLE,
  };
  ESP_ERROR_CHECK(gpio_config(&cfg));
  bus_release(sensor);
}

float ds18b20_read(ds18b20_t *sensor) {
  int64_t now = esp_timer_get_time();

  if(sensor->converting && now - sensor->t_start >= CONV_US) {
    uint8_t sp[9];
    sensor->converting = false;

    if(read_scratchpad(sensor, sp)) {
      sensor->last = (int16_t)((sp[1] << 8) | sp[0]) / 16.0f;
      sensor->errs = 0;
    } else {
      fail(sensor);
    }
  }

  if(!sensor->converting) {
    if(start_conversion(sensor)) {
      sensor->converting = true;
      sensor->t_start = now;
    } else {
      fail(sensor);
    }
  }

  return sensor->last;
}