#include "esp_adc/adc_cali_scheme.h"
#include "esp_log.h"
#include "adc_input.h"

#define ADC_ATTEN ADC_ATTEN_DB_11   // en ESP-IDF >= 5.2 puedes cambiarlo a ADC_ATTEN_DB_12

static const char *TAG = "adc_input";
static adc_oneshot_unit_handle_t unit1;   // ADC1 compartido por todos los sensores

esp_err_t adc_input_init(adc_input_t *input, int gpio) {
  adc_unit_t unit;
  esp_err_t error = adc_oneshot_io_to_channel(gpio, &unit, &input->channel);

  if(error != ESP_OK) return error;
  if(unit != ADC_UNIT_1) return ESP_ERR_NOT_SUPPORTED;

  if(!unit1) {
    adc_oneshot_unit_init_cfg_t ucfg = { .unit_id = ADC_UNIT_1 };
    error = adc_oneshot_new_unit(&ucfg, &unit1);
    if(error != ESP_OK) return error;
  }

  adc_oneshot_chan_cfg_t ccfg = { .atten = ADC_ATTEN, .bitwidth = ADC_BITWIDTH_DEFAULT };
  error = adc_oneshot_config_channel(unit1, input->channel, &ccfg);
  if(error != ESP_OK) return error;

  input->calibrated = false;

  #if ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
    adc_cali_curve_fitting_config_t cc = {
      .unit_id = ADC_UNIT_1, .chan = input->channel, .atten = ADC_ATTEN, .bitwidth = ADC_BITWIDTH_DEFAULT,
    };

    input->calibrated = adc_cali_create_scheme_curve_fitting(&cc, &input->cali) == ESP_OK;
  #elif ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED
    adc_cali_line_fitting_config_t cc = {
      .unit_id = ADC_UNIT_1, .atten = ADC_ATTEN, .bitwidth = ADC_BITWIDTH_DEFAULT,
    };

    input->calibrated = adc_cali_create_scheme_line_fitting(&cc, &input->cali) == ESP_OK;
  #endif

  if(!input->calibrated) ESP_LOGW(TAG, "GPIO%d sin calibración, uso conversión aproximada", gpio);
  return ESP_OK;
}

int adc_input_read_mv(adc_input_t *input, int samples) {
  long sum = 0;
  int n = 0;

  for(int i = 0; i < samples; ++i) {
    int raw;
    if(adc_oneshot_read(unit1, input->channel, &raw) == ESP_OK) {
      sum += raw;
      n++;
    }
  }

  if(n == 0) return -1;

  int raw = (int)(sum / n);
  int mv;
  if(input->calibrated && adc_cali_raw_to_voltage(input->cali, raw, &mv) == ESP_OK) return mv;
  return raw * 2450 / 4095;
}