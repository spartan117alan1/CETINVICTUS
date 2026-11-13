idf_component_register(
  SRCS "yfs201.c"
  INCLUDE_DIRS "include"
  REQUIRES driver
  PRIV_REQUIRES esp_timer
)