#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef struct {
  bool wifi_up, mqtt_up;
  char ssid[33], ip[16];
  int8_t rssi;
  uint8_t channel;
} net_info_t;

void net_start(void);
void net_get_info(net_info_t*);
bool net_publish(const char*, const char*, const char*, int, bool);