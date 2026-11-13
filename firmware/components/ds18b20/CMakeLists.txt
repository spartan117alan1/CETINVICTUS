idf_component_register(
  SRCS "ds18b20.c"
  INCLUDE_DIRS "include"
  REQUIRES freertos
  PRIV_REQUIRES driver esp_timer esp_rom
)