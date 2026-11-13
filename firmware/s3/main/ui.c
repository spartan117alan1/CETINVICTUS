#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "display.h"
#include "gw_config.h"
#include "net.h"
#include "nodes.h"
#include "ui.h"

#define NODE_ROWS 7
#define N_PAGES 2

static volatile int page;
static TaskHandle_t task;

static void render_status(void) {
  net_info_t net_info;
  net_get_info(&net_info);

  node_t nodes[MAX_NODES];
  size_t n = nodes_snapshot(nodes, MAX_NODES);
  int online = 0;
  for(size_t i = 0; i < n; ++i) online += nodes[i].online;

  display_printf(0, "GW %s", GW_DEVICE_ID);
  display_printf(1, "WiFi %s", net_info.wifi_up ? net_info.ssid : "sin conexion");
  display_printf(2, "%s", net_info.wifi_up ? net_info.ip : "-");
  display_printf(3, "ch%d %ddBm", net_info.channel, net_info.rssi);
  display_printf(4, "MQTT %s", net_info.mqtt_up ? "OK" : "--");
  display_printf(5, "Nodos %d/%d", online, (int)n);
  display_printf(7, "heap %u", (unsigned)esp_get_free_heap_size());
}

static void render_nodes(void) {
  node_t nodes[MAX_NODES];
  size_t n = nodes_snapshot(nodes, MAX_NODES);
  int64_t now = esp_timer_get_time();

  display_printf(0, "--- Nodos %d ---", (int)n);

  for(size_t i = 0; i < n && i < NODE_ROWS; ++i) {
    int age = (int)((now - nodes[i].last_seen_us) / 1000000);
    display_printf(1 + (int)i, "N%02d %s %ddBm %ds", nodes[i].node_id, nodes[i].online ? "OK" : "OFF", nodes[i].rssi, age);
  }
}

static void render(void) {
  display_clear();
  if(page == 0) render_status();
  else render_nodes();
  display_flush();
}

static void ui_task(void *arg) {
  for(;;) {
    render();
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000));
  }
}

void ui_next_page(void) {
  page = (page + 1) % N_PAGES;
  if(task) xTaskNotifyGive(task);
}

void ui_start(void) {
  xTaskCreate(ui_task, "ui", 4096, NULL, 3, &task);
}