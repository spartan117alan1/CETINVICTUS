#include <string.h>
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_now.h"
#include "nvs_flash.h"
#include "proto.h"
#include "config.h"
#include "tx.h"

static const char *TAG = "tx";
static const uint8_t S3_MAC[6] = S3_MAC_ADDR;
static volatile int fails = 0;
static uint8_t channel = ESPNOW_CHANNEL; 
static volatile bool cmd_pending;
static proto_cmd_t cmd_buf;

static void on_sent(const uint8_t *mac, esp_now_send_status_t status) {
  if(status == ESP_NOW_SEND_SUCCESS) {
    if(fails > 0) ESP_LOGI(TAG, "enlazado en canal %d", channel);
    fails = 0;
  } else {
    fails++;
  }
}

static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  proto_cmd_t c;
  if(memcmp(info->src_addr, S3_MAC, 6) != 0) return;
  if(!proto_cmd_parse(data, len, &c) || c.node_id != NODE_ID) return;

  cmd_buf = c;
  cmd_pending = true;
}

static void hop_channel(void) {
  channel = channel % 13 + 1;
  ESP_ERROR_CHECK(esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE));
  ESP_LOGW(TAG, "probando canal %d", channel);
  fails = 1;
}

void tx_start(void) {
  esp_err_t error = nvs_flash_init();
  if(error == ESP_ERR_NVS_NO_FREE_PAGES || error == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    error = nvs_flash_init();
  }

  ESP_ERROR_CHECK(error);
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());

  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_start());
  ESP_ERROR_CHECK(esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE));

  ESP_ERROR_CHECK(esp_now_init());
  ESP_ERROR_CHECK(esp_now_register_send_cb(on_sent));
  ESP_ERROR_CHECK(esp_now_register_recv_cb(on_recv));

  esp_now_peer_info_t peer = { 0 };
  memcpy(peer.peer_addr, S3_MAC, 6);
  peer.channel = 0;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  ESP_ERROR_CHECK(esp_now_add_peer(&peer));
}

void tx_send(const uint8_t *data, size_t len) {
  if (fails >= 2) hop_channel();
  esp_err_t r = esp_now_send(S3_MAC, data, len);
  if (r != ESP_OK) ESP_LOGW(TAG, "esp_now_send: %s", esp_err_to_name(r));
}

bool tx_linked(void) {
  return fails == 0;
}

bool tx_poll_cmd(proto_cmd_t *out) {
  if(!cmd_pending) return false;
  *out = cmd_buf;
  cmd_pending = false;
  return true;
}