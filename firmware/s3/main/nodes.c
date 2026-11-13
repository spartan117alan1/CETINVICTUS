#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "esp_timer.h"
#include "gw_config.h"
#include "nodes.h"

static node_t table[MAX_NODES];
static SemaphoreHandle_t mu;

void nodes_init(void) {
  mu = xSemaphoreCreateMutex();
}

bool nodes_touch(uint8_t node_id, const uint8_t *mac, int8_t rssi, uint8_t seq, bool *came_online) {
  node_t *slot = NULL;
  xSemaphoreTake(mu, portMAX_DELAY);

  for(int i = 0; i < MAX_NODES && !slot; ++i) {
    if(table[i].used && table[i].node_id == node_id) slot = &table[i];
  }

  for(int i = 0; i < MAX_NODES && !slot; ++i) {
    if(!table[i].used) {
      slot = &table[i];
      memset(slot, 0, sizeof *slot);
      slot->used = true;
      slot->node_id = node_id;
    }
  }

  if(slot) {
    *came_online = !slot->online;
    slot->online = true;
    memcpy(slot->mac, mac, 6);
    slot->rssi = rssi;
    slot->last_seq = seq;
    slot->last_seen_us = esp_timer_get_time();
    slot->frames++;
  }

  xSemaphoreGive(mu);
  return slot != NULL;
}

size_t nodes_expire(int64_t now_us, uint8_t *ids, size_t max) {
  size_t n = 0;
  xSemaphoreTake(mu, portMAX_DELAY);

  for(int i = 0; i < MAX_NODES && n < max; ++i) {
    if(table[i].used && table[i].online && now_us - table[i].last_seen_us > (int64_t)NODE_TIMEOUT_MS * 1000) {
      table[i].online = false;
      ids[n++] = table[i].node_id;
    }
  }

  xSemaphoreGive(mu);
  return n;
}

size_t nodes_snapshot(node_t *out, size_t max) {
  size_t n = 0;
  xSemaphoreTake(mu, portMAX_DELAY);

  for(int i = 0; i < MAX_NODES && n < max; ++i) {
    if(table[i].used) out[n++] = table[i];
  }

  xSemaphoreGive(mu);
  return n;
}