idf_component_register(
  SRCS "main.c" "sensors.c" "tx.c"
  INCLUDE_DIRS "."
  REQUIRES proto fc51 ds18b20 tsw20 tds yfs201 ph4502c dht11 mq135 led
  PRIV_REQUIRES esp_wifi esp_netif esp_event nvs_flash esp_timer esp_system
)