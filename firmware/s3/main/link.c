#include <string.h>
#include "esp_log.h"
#include "esp_now.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "net.h"
#include "nodes.h"
#include "proto.h"
#include "telemetry.h"
#include "link.h"

static const char *TAG = "link";

typedef struct {
  uint8_t mac[6];
  int8_t rssi;
  uint8_t len;
  uint8_t data[PROTO_MAX_FRAME];
} rx_item_it;

static QueueHandle_t q;

static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if(len <= 0 || len > PROTO_MAX_FRAME) return;

  rx_item_it it;
  memcpy(it.mac, info->src_addr, 6);

  it.rssi = info->rx_ctrl->rssi;
  it.len = (uint8_t)len;

  memcpy(it.data, data, len);
  xQueueSend(q, &it, 0);
}

static void handle(const rx_item_it *it) {
  proto_hdr_t hdr;
  if(!proto_parse(it->data, it->len, &hdr)) {
    ESP_LOGW(TAG, "trama inválida (%u bytes)", it->len);
    return;
  }

  bool came_online = false;
  if(!nodes_touch(hdr.node_id, it->mac, it->rssi, hdr.seq, &came_online)) {
    ESP_LOGW(TAG, "tabla de nodos llena, descarto nodo %u", hdr.node_id);
    return;
  }

  char dev[24];
  node_device_id(dev, sizeof dev, hdr.node_id);
  if(came_online) {
    ESP_LOGI(TAG, "%s en línea", dev);
    net_publish(dev, "status", "online", 1, true);
  }

  telemetry_from_node(it->data, it->len, it->rssi);
}

static void link_task(void *arg) {
  rx_item_it it;

  for(;;) {
    if(xQueueReceive(q, &it, pdMS_TO_TICKS(1000)) == pdTRUE) handle(&it);

    uint8_t gone[MAX_NODES];
    size_t n = nodes_expire(esp_timer_get_time(), gone, MAX_NODES);

    for(size_t i = 0; i < n; ++i) {
      char dev[24];
      node_device_id(dev, sizeof dev, gone[i]);
      ESP_LOGW(TAG, "%s sin tramas: offline", dev);
      net_publish(dev, "status", "offline", 1, true);
    }
  }
}

void link_start(void) {
  nodes_init();
  q = xQueueCreate(8, sizeof(rx_item_it));
  xTaskCreate(link_task, "link", 6144, NULL, 5, NULL);
  ESP_ERROR_CHECK(esp_now_init());
  ESP_ERROR_CHECK(esp_now_register_recv_cb(on_recv));
}

bool link_send_cmd(uint8_t node_id, uint8_t cmd, uint8_t arg) {
  node_t t[MAX_NODES];
  size_t n = nodes_snapshot(t, MAX_NODES);
  const node_t *node = NULL;

  for(size_t i = 0; i < n; ++i) {
    if(t[i].node_id == node_id) node = &t[i];
  }
  if(!node || !node->online) return false;

  if(!esp_now_is_peer_exist(node->mac)) {
    esp_now_peer_info_t peer = { 0 };
    memcpy(peer.peer_addr, node->mac, 6);
    peer.channel = 0;
    peer.ifidx = WIFI_IF_STA;
    peer.encrypt = false;
    if(esp_now_add_peer(&peer) != ESP_OK) return false;
  }

  proto_cmd_t c;
  proto_cmd_build(&c, node_id, cmd, arg);
  return esp_now_send(node->mac, (const uint8_t *)&c, sizeof c) == ESP_OK;
}