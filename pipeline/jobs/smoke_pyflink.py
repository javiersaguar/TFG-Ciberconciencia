"""Prueba mínima: PyFlink arranca y crea un TableEnvironment en streaming."""
from pyflink.table import EnvironmentSettings, TableEnvironment

def main():
    settings = EnvironmentSettings.in_streaming_mode()
    t_env = TableEnvironment.create(settings)
    print("PyFlink OK — TableEnvironment creado")
    print("Config idle-timeout:", t_env.get_config().get("table.exec.source.idle-timeout", "no-set"))

if __name__ == "__main__":
    main()