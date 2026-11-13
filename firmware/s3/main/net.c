#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>
#include <strings.h>
#include "esp_log.h"
#include "esp_event.h"
#include "esp_wifi.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "mqtt_client.h"
#include "esp_sntp.h"
#include "gw_config.h"
#include "maint.h"
#include "link.h"
#include "net.h"
#include "proto.h"
#include "secrets.h"

static const char *TAG = "net";
static esp_mqtt_client_handle_t mqtt;
static volatile bool mqtt_ok = false;
static volatile bool mqtt_started = false;
static esp_netif_t *sta_netif;
static char lwt_topic[128];
static int retry_ms = 3000;

static void on_wifi(void *arg, esp_event_base_t base, int32_t id, void *data) {
  if(base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
    esp_wifi_connect();
  } else if(base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    wifi_event_sta_disconnected_t *d = (wifi_event_sta_disconnected_t *)data;
    ESP_LOGW(TAG, "Wi-Fi desconectado, motivo=%d", d->reason);
    esp_wifi_connect();
  } else if(base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    retry_ms = 3000;
    ip_event_got_ip_t *e = (ip_event_got_ip_t *)data;
    ESP_LOGI(TAG, "IP asignada: " IPSTR, IP2STR(&e->ip_info.ip));
    if(!mqtt_started) {
      mqtt_started = true;
      esp_mqtt_client_start(mqtt);
      esp_sntp_setoperatingmode(ESP_SNTP_OPMODE_POLL);
      esp_sntp_setservername(0, "pool.ntp.org");
      esp_sntp_init();
    }
  }
}

static void on_mqtt(void *arg, esp_event_base_t base, int32_t id, void *data) {
  switch((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED: {
      ESP_LOGI(TAG, "MQTT conectado");
      mqtt_ok = true;
      net_publish(GW_DEVICE_ID, "status", "online", 1, true);

      char filter[128];
      snprintf(filter, sizeof filter, "%s/%s/%s/+/cmd/+", MQTT_ORG, MQTT_REGION, MQTT_ZONE);
      esp_mqtt_client_subscribe(mqtt, filter, 1);   // la sesión es limpia: se suscribe en cada conexión
      break;
    }

    case MQTT_EVENT_DATA: {
      esp_mqtt_event_handle_t ev = data;
      if(ev->current_data_offset != 0 || ev->data_len != ev->total_data_len) break;

      char topic[128], payload[16];
      if(ev->topic_len <= 0 || ev->topic_len >= (int)sizeof topic) break;
      if(ev->data_len <= 0 || ev->data_len >= (int)sizeof payload) break;

      memcpy(topic, ev->topic, ev->topic_len);
      topic[ev->topic_len] = 0;
      memcpy(payload, ev->data, ev->data_len);
      payload[ev->data_len] = 0;
      payload[strcspn(payload, "\r\n ")] = 0;

      const char *p = strstr(topic, "esp32_node_");
      const char *cmd = strstr(topic, "/cmd/");
      unsigned node;

      if(!p || !cmd || sscanf(p, "esp32_node_%u", &node) != 1 || node > 255) break;
      cmd += 5;

      if(strcmp(cmd, "maintenance") == 0) {
        if(!maint_mark((uint8_t)node, payload)) ESP_LOGW(TAG, "mantenimiento rechazado: %s", payload);
      } else if(strcmp(cmd, "led") == 0) {
        bool on;
        if(!strcmp(payload, "1") || !strcasecmp(payload, "on")) on = true;
        else if(!strcmp(payload, "0") || !strcasecmp(payload, "off")) on = false;
        else { ESP_LOGW(TAG, "valor de led inválido: %s", payload); break; }

        if(!link_send_cmd((uint8_t)node, CMD_LED, on)) ESP_LOGW(TAG, "nodo %u no disponible, comando led descartado", node);
      } else {
        ESP_LOGW(TAG, "comando desconocido: %s", cmd);
      }
      
      break;
    }

    case MQTT_EVENT_DISCONNECTED: {
      ESP_LOGW(TAG, "MQTT desconectado");
      mqtt_ok = false;
      break;
    }

    default: break;
  }
}

void net_start(void) {
  esp_err_t error = nvs_flash_init();
  if(error == ESP_ERR_NVS_NO_FREE_PAGES || error == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    error = nvs_flash_init();
  }

  ESP_ERROR_CHECK(error);
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  sta_netif = esp_netif_create_default_wifi_sta();

  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_wifi, NULL));
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_wifi, NULL));

  wifi_config_t wc = { 0 };
  strlcpy((char *)wc.sta.ssid, WIFI_SSID, sizeof wc.sta.ssid);
  strlcpy((char *)wc.sta.password, WIFI_PASS, sizeof wc.sta.password);
  wc.sta.pmf_cfg.capable = true;
  wc.sta.pmf_cfg.required = false;
  wc.sta.sae_pwe_h2e = WPA3_SAE_PWE_BOTH;
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));

  snprintf(lwt_topic, sizeof lwt_topic, "%s/%s/%s/%s/status", MQTT_ORG, MQTT_REGION, MQTT_ZONE, GW_DEVICE_ID);

  esp_mqtt_client_config_t mc = {
    .broker.address.uri = MQTT_URI,
    .credentials.client_id = "s3-led",
    .session.keepalive = 30,
    .session.last_will = {
      .topic = lwt_topic, .msg = "offline", .qos = 1, .retain = 1
    },
  };

  mqtt = esp_mqtt_client_init(&mc);
  esp_mqtt_client_register_event(mqtt, ESP_EVENT_ANY_ID, on_mqtt, NULL);

  ESP_ERROR_CHECK(esp_wifi_start());
  ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
}

bool net_publish(const char *device_id, const char *type, const char *payload, int qos, bool retain) {
  if(!mqtt_ok) return false;
  if(qos > 0 && esp_mqtt_client_get_outbox_size(mqtt) > 8192) return false;
  
  char topic[128];
  snprintf(topic, sizeof topic, "%s/%s/%s/%s/%s", MQTT_ORG, MQTT_REGION, MQTT_ZONE, device_id, type);
  return esp_mqtt_client_publish(mqtt, topic, payload, 0, qos, retain) >= 0;
}

void net_get_info(net_info_t *out) {
  memset(out, 0, sizeof *out);
  out->mqtt_up = mqtt_ok;
  wifi_ap_record_t ap;

  if(esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
    out->wifi_up = true;
    strlcpy(out->ssid, (const char *)ap.ssid, sizeof out->ssid);
    out->rssi = ap.rssi;
    out->channel = ap.primary;

    esp_netif_ip_info_t ip;
    if(sta_netif && esp_netif_get_ip_info(sta_netif, &ip) == ESP_OK) {
      snprintf(out->ip, sizeof out->ip, IPSTR, IP2STR(&ip.ip));
    }
  }
}