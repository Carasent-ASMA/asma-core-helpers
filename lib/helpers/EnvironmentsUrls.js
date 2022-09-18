import { configWeb, EnvironmentEnums } from '..';
export const EnvironmentsUrls = {
    local: {
        SRV_DIRECTORY: `http://${window.location.hostname}:7001`,
        SRV_CALENDAR: `http://${window.location.hostname}:7011`,
        SRV_PROXY_OLD: `http://${window.location.hostname}:4430`,
        SRV_STORAGE: `http://${window.location.hostname}:4000`,
        SRV_CHAT: `http://${window.location.hostname}:7012`,
        SRV_CONNECTOR: 'https://connector-dev.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: `http://${window.location.hostname}:4433`,
        SRV_PROXY: `http://${window.location.hostname}:7003`,
        SRV_NOTIFICATION: `http://${window.location.hostname}:7002`,
        SRV_AO_DIRECTORY: `http://${window.location.hostname}:7013`,
    },
    dev: {
        SRV_DIRECTORY: 'https://dev.adopus.no/api/directory',
        SRV_CALENDAR: 'https://dev.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://dev.adopus.no/api/proxy',
        SRV_STORAGE: 'https://dev.adopus.no/api/storage',
        SRV_CHAT: 'https://dev.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector-test.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://dev.advoca.no/api/service',
        SRV_PROXY: 'https://dev.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://dev.adopus.no/api/notification',
        SRV_AO_DIRECTORY: 'https://dev.adopus.no/api-ao/directory',
    },
    test: {
        SRV_DIRECTORY: 'https://test.adopus.no/api/directory',
        SRV_CALENDAR: 'https://test.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://test.adopus.no/api/proxy',
        SRV_STORAGE: 'https://test.adopus.no/api/storage',
        SRV_CHAT: 'https://test.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector-test.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://test.advoca.no/api/service',
        SRV_PROXY: 'https://test.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://test.adopus.no/api/notification',
        SRV_AO_DIRECTORY: 'https://test.adopus.no/api-ao/directory',
    },
    stage: {
        SRV_DIRECTORY: 'https://stage.adopus.no/api/directory',
        SRV_CALENDAR: 'https://stage.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://stage.adopus.no/api/proxy',
        SRV_STORAGE: 'https://stage.adopus.no/api/storage',
        SRV_CHAT: 'https://stage.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector.adopus.no/stage',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://stage.advoca.no/api/service',
        SRV_PROXY: 'https://stage.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://stage.adopus.no/api/notification',
        SRV_AO_DIRECTORY: 'https://stage.adopus.no/api-ao/directory',
    },
    prod: {
        SRV_DIRECTORY: 'https://www.adopus.no/api/directory',
        SRV_CALENDAR: 'https://www.adopus.no/api/calendar',
        SRV_PROXY_OLD: 'https://www.adopus.no/api/proxy',
        SRV_STORAGE: 'https://www.adopus.no/api/storage',
        SRV_CHAT: 'https://www.adopus.no/api/chat',
        SRV_CONNECTOR: 'https://connector.adopus.no',
        SRV_ARTIFACT: '',
        SRV_ADVOCA: 'https://www.advoca.no/api/service',
        SRV_PROXY: 'https://www.adopus.no/api/srvproxy',
        SRV_NOTIFICATION: 'https://www.adopus.no/api/notification',
        SRV_AO_DIRECTORY: 'https://www.adopus.no/api-ao/directory',
    },
};
export function environmentUrls(ENVIRONMENT_TO_OPERATE) {
    let env;
    const env_to_operate_window = configWeb('ENVIRONMENT_TO_OPERATE', '');
    if ((ENVIRONMENT_TO_OPERATE && ENVIRONMENT_TO_OPERATE in EnvironmentEnums) ||
        env_to_operate_window in EnvironmentEnums) {
        env = (ENVIRONMENT_TO_OPERATE || env_to_operate_window);
        return env && EnvironmentsUrls[env];
    }
    return;
}
//# sourceMappingURL=EnvironmentsUrls.js.map