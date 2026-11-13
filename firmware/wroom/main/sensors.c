#include <math.h>
#include <stdbool.h>
#include "esp_random.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "board.h"
#include "fc51.h"
#include "ds18b20.h"
#include "tsw20.h"
#include "tds.h"
#include "yfs201.h"
#include "ph4502c.h"
#include "dht11.h"
#include "mq135.h"
#include "led.h"
#include "metrics.h"
#include "sensors.h"

#define PH_CAL_A_V 3.04f // V en Po con buffer pH 4.00
#define PH_CAL_A_PH 4.00f
#define PH_CAL_B_V 2.50f // V en Po con buffer pH 7.00
#define PH_CAL_B_PH 7.00f
#define PH_CAL_TEMP 25.f // °C de los buffers al calibrar

#define GAS_VCC 5.0f
#define GAS_RL_OHM 10000.f
#define GAS_R0_OHM 76630.f

static fc51_t prox;
static ds18b20_t water_temp;
static tsw20_t turb;
static tds_t tds;
static yfs201_t flow;
static ph4502c_t ph_sensor;
static dht11_t air;
static mq135_t gas;
static led_t status_led;

static status_t from_tsw20(tsw20_status_t s) {
  switch(s) {
    case TSW20_OK:      return ST_OK;
    case TSW20_WARNING: return ST_WARNING;
    case TSW20_FAULT:   return ST_FAULT;
  }
  return ST_FAULT;
}

static status_t from_tds(tds_status_t s) {
  switch(s) {
    case TDS_OK:      return ST_OK;
    case TDS_WARNING: return ST_WARNING;
    case TDS_FAULT:   return ST_FAULT;
  }
  return ST_FAULT;
}

static status_t from_ph(ph_status_t s) {
  switch(s) {
    case PH_OK:      return ST_OK;
    case PH_WARNING: return ST_WARNING;
    case PH_FAULT:   return ST_FAULT;
  }
  return ST_FAULT;
}

static status_t from_dht11(dht11_status_t s) {
  switch(s) {
    case DHT11_OK:      return ST_OK;
    case DHT11_WARNING: return ST_WARNING;
    case DHT11_FAULT:   return ST_FAULT;
  }
  return ST_FAULT;
}

static status_t from_mq135(mq135_status_t s) {
  switch(s) {
    case MQ135_OK:      return ST_OK;
    case MQ135_WARNING: return ST_WARNING;
    case MQ135_FAULT:   return ST_FAULT;
  }
  return ST_FAULT;
}

static float read_proximity(void) {
  return fc51_detected(&prox) ? 1.f : 0.f;
}

static float read_temp_c(void) {
  return ds18b20_read(&water_temp);
}

static float read_turb_ntu(void) {
  tsw20_update(&turb);
  return tsw20_get(&turb).ntu;
}

static float read_turb_mv(void) {
  return tsw20_get(&turb).volts * 1000.f;
}

static float read_turb_lens(void) {
  return tsw20_get(&turb).lens_pct;
}

static float read_turb_status(void) {
  return (float)from_tsw20(tsw20_get(&turb).status);
}

static float read_tds_ppm(void) {
  tds_update(&tds, water_temp.last);
  return tds_get(&tds).ppm;
}

static float read_tds_mv(void) {
  return tds_get(&tds).volts * 1000.f;
}

static float read_tds_status(void) {
  return (float)from_tds(tds_get(&tds).status);
}

static float read_flow_lpm(void) {
  yfs201_update(&flow);
  return yfs201_lpm(&flow);
}

static float read_flow_total(void) {
  return yfs201_total_l(&flow);
}

static float read_ph(void) {
  ph4502c_update(&ph_sensor, water_temp.last);
  return ph4502c_get(&ph_sensor).ph;
}

static float read_ph_mv(void) {
  return ph4502c_get(&ph_sensor).volts * 1000.f;
}

static float read_ph_status(void) {
  return (float)from_ph(ph4502c_get(&ph_sensor).status);
}

static float read_air_temp(void) {
  dht11_update(&air);
  return dht11_get(&air).temp_c;
}

static float read_air_hum(void) {
  return dht11_get(&air).humidity;
}

static float read_air_status(void) {
  return (float)from_dht11(dht11_get(&air).status);
}

static float read_gas_ppm(void) {
  dht11_reading_t a = dht11_get(&air);
  mq135_update(&gas, a.temp_c, a.humidity);
  return mq135_get(&gas).ppm;
}

static float read_gas_mv(void) {
  return mq135_get(&gas).volts * 1000.f;
}

static float read_gas_status(void) {
  return (float)from_mq135(mq135_get(&gas).status);
}

static float read_heap(void) {
  return (float)esp_get_free_heap_size();
}

static float read_led(void) {
  return led_is_on(&status_led) ? 1.f : 0.f;
}

void sensors_set_led(bool on) {
  led_set(&status_led, on);
}

static float rnd(void) {
  return (float)(esp_random() % 2001) / 1000.f - 1.f;
}

static float walk(float *value, float lo, float hi, float step) {
  *value += rnd() * step;
  if(*value < lo) *value = lo;
  if(*value > hi) *value = hi;
  return *value;
}

static float sim_battery(void) {
  static float value = 3.85f;
  return walk(&value, 3.4f, 4.2f, 0.005f);
}

typedef struct {
  metric_id_t id;
  float (*read)(void);
  uint32_t sample_ms;
  float deadband;
  float value, last_sent;
  bool valid;
  int64_t t_sample;
} sensor_t;

static sensor_t SENSOR_TABLE[] = {
  { .id = M_OBJECT_DETECTED,  .read = read_proximity,   .sample_ms = 10,    .deadband = 0.5f },
  { .id = M_PH,               .read = read_ph,          .sample_ms = 1000 },
  { .id = M_TURBIDITY_NTU,    .read = read_turb_ntu,    .sample_ms = 500 },
  { .id = M_WATER_TEMP_C,     .read = read_temp_c,      .sample_ms = 1000 },
  { .id = M_CONDUCTIVITY_TDS, .read = read_tds_ppm,     .sample_ms = 1000 },
  { .id = M_FLOW_LPM,         .read = read_flow_lpm,    .sample_ms = 1000 },
  { .id = M_FLOW_TOTAL_L,     .read = read_flow_total,  .sample_ms = 1000 },
  { .id = M_AIR_TEMP_C,       .read = read_air_temp,    .sample_ms = 2000 },
  { .id = M_AIR_HUMIDITY_PCT, .read = read_air_hum,     .sample_ms = 2000 },
  { .id = M_GAS_PPM,          .read = read_gas_ppm,     .sample_ms = 1000 },
  { .id = M_TURB_VOLTAGE_MV,  .read = read_turb_mv,     .sample_ms = 500 },
  { .id = M_TURB_LENS_PCT,    .read = read_turb_lens,   .sample_ms = 500 },
  { .id = M_TURB_STATUS,      .read = read_turb_status, .sample_ms = 500,   .deadband = 0.5f },
  { .id = M_TDS_VOLTAGE_MV,   .read = read_tds_mv,      .sample_ms = 1000 },
  { .id = M_TDS_STATUS,       .read = read_tds_status,  .sample_ms = 1000,  .deadband = 0.5f },
  { .id = M_PH_ELECTRODE_MV,  .read = read_ph_mv,       .sample_ms = 1000 },
  { .id = M_PH_STATUS,        .read = read_ph_status,   .sample_ms = 1000,  .deadband = 0.5f },
  { .id = M_DHT_STATUS,       .read = read_air_status,  .sample_ms = 2000,  .deadband = 0.5f },
  { .id = M_GAS_VOLTAGE_MV,   .read = read_gas_mv,      .sample_ms = 1000 },
  { .id = M_GAS_STATUS,       .read = read_gas_status,  .sample_ms = 1000,  .deadband = 0.5f },
  { .id = M_FREE_HEAP_BYTES,  .read = read_heap,        .sample_ms = 2000 },
  { .id = M_BATTERY_V,        .read = sim_battery,      .sample_ms = 5000 },
  { .id = M_LED,              .read = read_led,         .sample_ms = 100,   .deadband = 0.5f },
};

#define N_SENSORS (sizeof SENSOR_TABLE / sizeof SENSOR_TABLE[0])

static bool sample(sensor_t *sensor, int64_t now) {
  float value = sensor->read();
  sensor->t_sample = now;

  if(isnan(value)) {
    sensor->valid = false;
    return false;
  }

  bool urgent = sensor->valid && sensor->deadband > 0 && fabsf(value - sensor->last_sent) >= sensor->deadband;
  sensor->value = value;
  sensor->valid = true;
  return urgent;
}

void sensors_init(void) {
  ph_cal_t cal_a = { PH_CAL_A_V, PH_CAL_A_PH };
  ph_cal_t cal_b = { PH_CAL_B_V, PH_CAL_B_PH };

  fc51_init(&prox, PROX_PIN);
  ds18b20_init(&water_temp, TEMP_PIN);
  ESP_ERROR_CHECK(tsw20_init(&turb, TURB_PIN, 0.5f, 4.1f));
  ESP_ERROR_CHECK(tds_init(&tds, COND_PIN, 1.0f));
  ESP_ERROR_CHECK(yfs201_init(&flow, FLOW_PIN, 450.f));
  ESP_ERROR_CHECK(ph4502c_init(&ph_sensor, PH_PIN, 0.5f, cal_a, cal_b, PH_CAL_TEMP));
  ESP_ERROR_CHECK(dht11_init(&air, HUM_TEMP_PIN));
  ESP_ERROR_CHECK(mq135_init(&gas, GAS_PIN, 0.5f, GAS_VCC, GAS_RL_OHM, GAS_R0_OHM));
  led_init(&status_led, LED_PIN, true);

  int64_t now = esp_timer_get_time();
  
  for(size_t i = 0; i < N_SENSORS; ++i) {
    sample(&SENSOR_TABLE[i], now);
    SENSOR_TABLE[i].last_sent = SENSOR_TABLE[i].value;
  }
}

bool sensors_poll(int64_t now_us) {
  bool urgent = false;

  for(size_t i = 0; i < N_SENSORS; ++i) {
    if(now_us - SENSOR_TABLE[i].t_sample >= (int64_t)SENSOR_TABLE[i].sample_ms * 1000) {
      urgent |= sample(&SENSOR_TABLE[i], now_us);
    }
  }

  return urgent;
}

void sensors_fill(proto_frame_t *frame) {
  for(size_t i = 0; i < N_SENSORS; ++i) {
    if(!SENSOR_TABLE[i].valid) continue;
    if(!proto_add(frame, SENSOR_TABLE[i].id, SENSOR_TABLE[i].value)) break;
    SENSOR_TABLE[i].last_sent = SENSOR_TABLE[i].value;
  }
}