#pragma once
#include <stdbool.h>
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"

typedef struct {
  adc_channel_t channel;
  adc_cali_handle_t cali;
  bool calibrated;
} adc_input_t;

esp_err_t adc_input_init(adc_input_t *input, int gpio);
int adc_input_read_mv(adc_input_t *input, int samples); 