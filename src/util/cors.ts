import { remote } from 'electron';

declare module 'electron' {
	export const remote: {
		session: {
			defaultSession: import('electron').Session;
		}
	}
}

const filter = {
	urls: ['*://*.google.com/*']
};

console.log(remote.session.defaultSession);

remote.session.defaultSession.webRequest
	.onBeforeSendHeaders(
		filter,
		(details, callback) => {
			console.log(details);
			delete details.requestHeaders['Origin'];
			callback({ requestHeaders: details.requestHeaders });
		}
	);

remote.session.defaultSession.webRequest.onHeadersReceived(
	filter,
	(details, callback) => {
		console.log(details);
		details.responseHeaders!['Access-Control-Allow-Origin'] = [
			'capacitor-electron://-'
		];
		callback({ responseHeaders: details.responseHeaders });
	}
);
