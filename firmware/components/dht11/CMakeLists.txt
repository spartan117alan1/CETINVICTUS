idf_component_register(
  SRCS "dht11.c"
  INCLUDE_DIRS "include"
  REQUIRES freertos
  PRIV_REQUIRES driver esp_timer esp_rom
)