#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "esp_log.h"
#include "nvs.h"
#include "maint.h"

#define NS "maint"
#define TIME_VALID 1700000000

static const char *TAG = "maint";
static const char *const SENSORS[] = { "ph", "turb", "tds", "gas" };
static nvs_handle_t h;
static bool ready;

static bool make_key(char *out, size_t n, uint8_t node, const char *sensor) {
  bool known = false;
  for(size_t i = 0; i < sizeof SENSORS / sizeof SENSORS[0]; ++i) known |= strcmp(sensor, SENSORS[i]) == 0;
  if(!known) return false;

  int r = snprintf(out, n, "n%02u_%s", node, sensor);
  return r > 0 && (size_t)r < n;
}

void maint_init(void) {
  esp_err_t r = nvs_open(NS, NVS_READWRITE, &h);
  ready = r == ESP_OK;
  if(!ready) ESP_LOGE(TAG, "nvs_open: %s", esp_err_to_name(r));
}

bool maint_mark(uint8_t node_id, const char *sensor) {
  char key[16];
  time_t now = time(NULL);

  if(!ready || now < TIME_VALID || !make_key(key, sizeof key, node_id, sensor)) return false;
  if(nvs_set_i64(h, key, (int64_t)now) != ESP_OK || nvs_commit(h) != ESP_OK) return false;

  ESP_LOGI(TAG, "mantenimiento registrado: nodo %u, %s", node_id, sensor);
  return true;
}

float maint_days(uint8_t node_id, const char *sensor) {
  char key[16];
  int64_t t;
  time_t now = time(NULL);

  if(!ready || now < TIME_VALID || !make_key(key, sizeof key, node_id, sensor)) return NAN;
  if(nvs_get_i64(h, key, &t) != ESP_OK) return NAN;
  if(now < t) return 0.f;
  return floorf((float)(now - t) / 86400.f);
}