import { cloneDeep, head } from "lodash-es";
import { ChangeEvent, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import TextareaAutosize from "react-textarea-autosize";
import { useConnectionStore } from "@/store";
import { Connection, Engine, ResponseObject, SSLOptions } from "@/types";
import Radio from "./kit/Radio";
import TextField from "./kit/TextField";
import Modal from "./kit/Modal";
import Icon from "./Icon";
import EngineIcon from "./EngineIcon";
import DataStorageBanner from "./DataStorageBanner";
import ActionConfirmModal from "./ActionConfirmModal";
import RequiredStar from "./RequiredStar";

interface Props {
  connection?: Connection;
  close: () => void;
}

type SSLType = "preferred" | "ca-only" | "full";

type SSLFieldType = "ca" | "cert" | "key";

const SSLTypeOptions = [
  {
    label: "Preferred",
    value: "preferred",
  },
  {
    label: "CA Only",
    value: "ca-only",
  },
  {
    label: "Full",
    value: "full",
  },
];

const engines = [
  {
    type: Engine.MySQL,
    name: "MySQL",
    defaultPort: "3306",
  },
  {
    type: Engine.PostgreSQL,
    name: "PostgreSQL",
    defaultPort: "5432",
  },
  {
    type: Engine.MSSQL,
    name: "SQL Server",
    defaultPort: "1433",
  },
  {
    type: Engine.TiDB,
    name: "TiDB Serverless",
    defaultPort: "4000",
  },
  {
    type: Engine.OceanBase,
    name: "OceanBase",
    defaultPort: "2881",
  },
  // {
  //   type: Engine.Snowflake,
  //   name: "Snowflake",
  //   defaultPort: "443",
  // },
  // {
  //   type: Engine.Hive,
  //   name: "Hive",
  //   defaultPort: "4000",
  // },
];

const defaultConnection: Connection = {
  id: "",
  title: "",
  engineType: Engine.MySQL,
  host: "",
  port: "3306",
  username: "",
  password: "",
};

const CreateConnectionModal = (props: Props) => {
  const { connection: editConnection, close } = props;
  const { t } = useTranslation();
  const connectionStore = useConnectionStore();
  const [connection, setConnection] = useState<Connection>(defaultConnection);
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false);
  const [sslType, setSSLType] = useState<SSLType>("preferred");
  const [selectedSSLField, setSelectedSSLField] = useState<SSLFieldType>("ca");
  const [isRequesting, setIsRequesting] = useState(false);
  const showDatabaseField = connection.engineType === Engine.PostgreSQL;
  const isEditing = editConnection !== undefined;
  const allowSave = connection.title !== "" && connection.host !== "" && connection.username !== "";

  useEffect(() => {
    const connection = isEditing ? editConnection : defaultConnection;
    setConnection(connection);
    if (connection.ssl) {
      if (connection.ssl.ca && connection.ssl.cert && connection.ssl.key) {
        setSSLType("full");
      } else {
        setSSLType("ca-only");
      }
    }
  }, []);

  useEffect(() => {
    let ssl: SSLOptions | undefined = undefined;
    if (sslType === "ca-only") {
      ssl = {
        ca: "",
      };
    } else if (sslType === "full") {
      ssl = {
        ca: "",
        cert: "",
        key: "",
      };
    }
    setConnection((connection) => ({
      ...connection,
      ssl: ssl,
    }));
    setSelectedSSLField("ca");
  }, [sslType]);

  const setPartialConnection = (state: Partial<Connection>) => {
    setConnection({
      ...connection,
      ...state,
    });
  };

  const handleSSLFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    if (file.type.startsWith("audio/") || file.type.startsWith("video/") || file.type.startsWith("image/")) {
      toast.error(`Invalid file type:${file.type}`);
      return;
    }

    const fr = new FileReader();
    fr.addEventListener("load", () => {
      setPartialConnection({
        ssl: {
          ...connection.ssl,
          [selectedSSLField]: fr.result as string,
        },
      });
    });
    fr.addEventListener("error", () => {
      toast.error("Failed to read file");
    });
    fr.readAsText(file);
  };

  const handleSSLValueChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setPartialConnection({
      ssl: {
        ...connection.ssl,
        [selectedSSLField]: event.target.value,
      },
    });
  };

  const handleUpsertConnection = async () => {
    if (isRequesting) {
      return;
    }

    setIsRequesting(true);
    const tempConnection = cloneDeep(connection);
    if (!showDatabaseField) {
      tempConnection.database = undefined;
    }

    try {
      const response = await fetch("/api/connection/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connection: tempConnection,
        }),
      });
      const result = (await response.json()) as ResponseObject<boolean>;
      if (result.message) {
        toast.error(result.message);
        return;
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to test connection");
    } finally {
      setIsRequesting(false);
    }

    try {
      let connection: Connection;
      if (isEditing) {
        connectionStore.updateConnection(tempConnection.id, tempConnection);
        connection = tempConnection;
      } else {
        connection = connectionStore.createConnection(tempConnection);
      }

      // Set the created connection as the current connection.
      const databaseList = await connectionStore.getOrFetchDatabaseList(connection, true);
      connectionStore.setCurrentConnectionCtx({
        connection: connection,
        database: head(databaseList),
      });
    } catch (error) {
      console.error(error);
      setIsRequesting(false);
      toast.error("Failed to create connection");
      return;
    }

    setIsRequesting(false);
    close();
  };

  const handleDeleteConnection = () => {
    connectionStore.clearConnection((item) => item.id !== connection.id);
    if (connectionStore.currentConnectionCtx?.connection.id === connection.id) {
      connectionStore.setCurrentConnectionCtx(undefined);
    }
    close();
  };

  return (
    <>
      <Modal title={isEditing ? t("connection.edit") : t("connection.new")} onClose={close}>
        <div className="w-full flex flex-col justify-start items-start space-y-3 mt-2">
          <DataStorageBanner className="rounded-lg bg-white border dark:border-zinc-700 py-2 !justify-start" alwaysShow={true} />
          <div className="w-full flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("connection.database-type")}
              <RequiredStar />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {engines.map((engine) => (
                <div
                  key={engine.type}
                  className="cursor-pointer relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:border-gray-400"
                  onClick={() => setPartialConnection({ engineType: engine.type, port: engine.defaultPort })}
                >
                  <Radio value={engine.type} checked={connection.engineType === engine.type} />
                  <EngineIcon className="h-6 w-6" engine={engine.type} />
                  <label htmlFor={engine.type} className="cursor-pointer ml-3 block text-sm font-medium leading-6 text-gray-900">
                    {engine.name}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="w-full flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("connection.title")}
              <RequiredStar />
            </label>
            <TextField placeholder="Title" value={connection.title} onChange={(value) => setPartialConnection({ title: value })} />
          </div>
          <div className="w-full flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("connection.host")}
              <RequiredStar />
            </label>
            <TextField placeholder="Connection host" value={connection.host} onChange={(value) => setPartialConnection({ host: value })} />
          </div>
          <div className="w-full flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("connection.port")}</label>
            <TextField placeholder="Connection port" value={connection.port} onChange={(value) => setPartialConnection({ port: value })} />
          </div>
          {showDatabaseField && (
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("connection.database-name")}</label>
              <TextField
                placeholder="Connection database"
                value={connection.database || ""}
                onChange={(value) => setPartialConnection({ database: value })}
              />
            </div>
          )}
          <div className="w-full flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("connection.username")}
              <RequiredStar />
            </label>
            <TextField
              placeholder="Connection username"
              value={connection.username || ""}
              onChange={(value) => setPartialConnection({ username: value })}
            />
          </div>
          <div className="w-full flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("connection.password")}</label>
            <TextField
              placeholder="Connection password"
              type="password"
              value={connection.password || ""}
              onChange={(value) => setPartialConnection({ password: value })}
            />
          </div>
          {connection.engineType === Engine.TiDB ? (
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("connection.tidb-serverless-ssl-hint")}</label>
            </div>
          ) : (
            <div className="w-full flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">SSL</label>
              <div className="w-full flex flex-row justify-start items-start flex-wrap">
                {SSLTypeOptions.map((option) => (
                  <label key={option.value} className="w-auto flex flex-row justify-start items-center cursor-pointer mr-3 mb-3">
                    <Radio
                      className="radio w-4 h-4 mr-1"
                      value={option.value}
                      checked={sslType === option.value}
                      onChange={(value) => setSSLType(value as SSLType)}
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
              {sslType !== "preferred" && (
                <>
                  <div className="text-sm space-x-3 mb-2">
                    <span
                      className={`leading-6 pb-1 border-b-2 border-transparent cursor-pointer opacity-60 hover:opacity-80 ${
                        selectedSSLField === "ca" && "!border-indigo-600 !opacity-100"
                      } `}
                      onClick={() => setSelectedSSLField("ca")}
                    >
                      CA Certificate
                    </span>
                    {sslType === "full" && (
                      <>
                        <span
                          className={`leading-6 pb-1 border-b-2 border-transparent cursor-pointer opacity-60 hover:opacity-80 ${
                            selectedSSLField === "key" && "!border-indigo-600 !opacity-100"
                          }`}
                          onClick={() => setSelectedSSLField("key")}
                        >
                          Client Key
                        </span>
                        <span
                          className={`leading-6 pb-1 border-b-2 border-transparent cursor-pointer opacity-60 hover:opacity-80 ${
                            selectedSSLField === "cert" && "!border-indigo-600 !opacity-100"
                          }`}
                          onClick={() => setSelectedSSLField("cert")}
                        >
                          Client Certificate
                        </span>
                      </>
                    )}
                  </div>
                  <div className="w-full h-auto relative">
                    <TextareaAutosize
                      className="w-full border resize-none rounded-lg text-sm p-3"
                      minRows={3}
                      maxRows={3}
                      value={(connection.ssl && connection.ssl[selectedSSLField]) ?? ""}
                      onChange={handleSSLValueChange}
                    />
                    <div
                      className={`${
                        connection.ssl && connection.ssl[selectedSSLField] && "hidden"
                      } absolute top-3 left-4 text-gray-400 text-sm leading-6 pointer-events-none`}
                    >
                      <span className="">Input or </span>
                      <label className="pointer-events-auto border border-dashed px-2 py-1 rounded-lg cursor-pointer hover:border-gray-600 hover:text-gray-600">
                        upload file
                        <input className="hidden" type="file" onChange={handleSSLFileInputChange} />
                      </label>
                    </div>
                  </div>
                </>
              )}
              {connection.engineType === Engine.MSSQL && (
                <div className="w-full flex flex-col">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Encrypt</label>
                  <div className="w-full flex flex-row justify-start items-start flex-wrap">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out"
                        checked={connection.encrypt}
                        onChange={(e) => setPartialConnection({ encrypt: e.target.checked })}
                      />
                      <span className="ml-2 text-sm">Encrypt connection</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-action w-full flex flex-row justify-between items-center space-x-2">
          <div>
            {isEditing && (
              <button className="btn btn-outline" onClick={() => setShowDeleteConnectionModal(true)}>
                {t("common.delete")}
              </button>
            )}
          </div>
          <div className="space-x-2 flex flex-row justify-center">
            <button className="btn btn-outline" onClick={close}>
              {t("common.close")}
            </button>
            <button className="btn" disabled={isRequesting || !allowSave} onClick={handleUpsertConnection}>
              {isRequesting && <Icon.BiLoaderAlt className="w-4 h-auto animate-spin mr-1" />}
              {t("common.save")}
            </button>
          </div>
        </div>
      </Modal>

      {showDeleteConnectionModal && (
        <ActionConfirmModal
          title="Delete Connection"
          content="Are you sure you want to delete this connection?"
          confirmButtonStyle="btn-error"
          close={() => setShowDeleteConnectionModal(false)}
          confirm={() => handleDeleteConnection()}
        />
      )}
    </>
  );
};

export default CreateConnectionModal;
