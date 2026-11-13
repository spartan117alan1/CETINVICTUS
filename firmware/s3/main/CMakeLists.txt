idf_component_register(
  SRCS "main.c" "display.c" "link.c" "maint.c" "net.c" "nodes.c" "telemetry.c" "ui.c"
  INCLUDE_DIRS "."
  REQUIRES proto button
  PRIV_REQUIRES driver esp_wifi esp_netif esp_event nvs_flash esp_timer esp_system mqtt json
)