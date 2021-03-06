document.title = "C2 Profile Management";
var profiles = []; //all profiles data
var username = "{{name|e}}";
var finished_profiles = false;
var parameters = [];
var profile_parameters_table = new Vue({
    el: '#profileEditParametersTable',
    data: {
        parameters,
        parameter_type_options: ['String', 'ChooseOne']
    },
    methods: {
    },
    delimiters: ['[[',']]']
});
var payloads_table = new Vue({
    el: '#c2profiles_table',
    data: {
        profiles
    },
    methods: {
        delete_button: function(p){
            $( '#profileDeleteModal' ).modal('show');
            $( '#profileDeleteSubmit' ).unbind('click').click(function(){
                httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id, delete_profile, "DELETE", null);
            });
        },
	    update_button: function(p){
            edit_payload_files.reset();
	        let possiblePayloadTypes = JSON.parse(httpGetSync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/payloadtypes/"));
            for(let i = 0; i < possiblePayloadTypes['payloads'].length; i++){
                if(p.payload_types.includes(possiblePayloadTypes['payloads'][i].ptype)){
                    edit_payload_files.edit_payload_file_list.push({"name": possiblePayloadTypes['payloads'][i].ptype, 'active': true});
                }else{
                    edit_payload_files.edit_payload_file_list.push({"name": possiblePayloadTypes['payloads'][i].ptype, 'active': false});
                }

            }
            // before we show the fields, populate them with the current data
            edit_payload_files.name = p.name;
            edit_payload_files.author = p.author;
            edit_payload_files.mythic_encrypts = p.mythic_encrypts;
            edit_payload_files.description = p.description;
            edit_payload_files.is_p2p = p.is_p2p;
            edit_payload_files.is_server_routed = p.is_server_routed;

            $( '#profileUpdateModal' ).modal('show');
	    },
	    check_status_button: function(p){
	        alertTop("info", "Get a few lines of stdout/stderr ...");
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/status", check_status_callback, "GET", null);
	    },
	    running_button: function(p){
	        if (p.running){
	            command = "stop";
	        }
	        else{
	            command = "start";
	        }
	        alertTop("info", "Submitting " + command + " task to container...");
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/" + command, update_profile_running, "GET", null);
	    },
	    parameters_button: function(p){
	        // first clear the current profileEditParametersTable
	        profile_parameters_table.parameters = [];

            // then see if there are any parameters already created for this profile
            let values = httpGetSync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/parameters");
            values = JSON.parse(values);
            if(values['status'] === "success"){
                for(let i = 0; i < values['c2profileparameters'].length; i++){
                    //console.log(values['c2profileparameters'][i]);
                    profile_parameters_table.parameters.push(values['c2profileparameters'][i]);
                }
                profile_parameters_table.parameters.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
            }
            else{
                alertTop("danger", "failed to get parameters");
                return;
            }

            // for each one we get back, create a new row
            //    this will be in the form of a Vue object we modify
            $( '#profileEditParametersModal').modal('show');
	    },
	    create_new_parameter_instance_button: function(p){
            // first clear the current profileEditParametersTable
	        instances_table.current_parameters = [];
            instances_table.current_name = "";
            // then see if there are any parameters already created for this profile
            let values = httpGetSync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/parameters");
            values = JSON.parse(values);
            if(values['status'] === "success"){
                for(let i = 0; i < values['c2profileparameters'].length; i++){
                    let inst = values['c2profileparameters'][i];
                    if(inst['parameter_type'] === 'ChooseOne'){
                        inst['parameter'] = inst['default_value'].split("\n")[0];
                    }else{
                        inst['parameter'] = inst['default_value'];
                    }
                    instances_table.current_parameters.push(inst);
                }
            }
            else{
                alertTop("danger", "failed to get parameters");
                return;
            }
            instances_table.current_parameters.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
            // for each one we get back, create a new row
            //    this will be in the form of a Vue object we modify
            $( '#profileCreateInstanceModal').modal('show');
            $( '#profileCreateInstanceSubmit').unbind('click').click(function(){
                // We now have a mix of old, new, modified, and deleted parameters
                let data = {'instance_name': instances_table.current_name};
                for(let i = 0; i < instances_table.current_parameters.length; i ++){
                    data[instances_table.current_parameters[i]['name']] = instances_table.current_parameters[i]['parameter'];
                }
                httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/parameter_instances", create_new_parameter_instance_callback, "POST", data);
            });
	    },
        edit_parameter_instance_button: function(p){
            instances_table.current_parameters = [];
            instances_table.c2_profile = p.name;
            if(instances_table.instance_options().length === 0){
                alertTop("warning", "No instances created for this C2 Profile");
                return;
            }
            instances_table.current_name = instances_table.instance_options()[0].instance_name;
            instances_table.current_parameters.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
            // for each one we get back, create a new row
            //    this will be in the form of a Vue object we modify
            $( '#profileEditInstanceModal').modal('show');
            $( '#profileEditInstanceSubmit').unbind('click').click(function(){
                // We now have a mix of old, new, modified, and deleted parameters
                let data = {'instance_name': instances_table.current_name};
                for(let i = 0; i < instances_table.current_parameters.length; i ++){
                    data[instances_table.current_parameters[i]['name']] = instances_table.current_parameters[i]['parameter'];
                }
                httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/parameter_instances", create_new_parameter_instance_callback, "POST", data);
            });
        },
        configure_server: function(p){
            profile_files_modal.profile_name = p.name;
            profile_files_modal.profile_id = p.id;
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/files/container_config_download", (response)=>{
                try{
                    let data = JSON.parse(response);
                    if(data['status'] === 'success'){
                        alertTop("info", "Fetching config ...", 1);
                        $('#profileFilesModal').modal('show');
                    }else{
                        alertTop("warning", data['error']);
                    }
                }catch(error){
                    alertTop("danger","Session expired, please refresh");
                }
            }, "GET", null);
            $( '#profileFilesSubmit' ).unbind('click').click(function(){
                httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/files/container_config_upload", (response)=>{
                    console.log(response);
                }, "POST", {"code": btoa(profile_files_modal.code)});
            });
        },
        sync_profile_button: function(p){
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + p.id + "/files/sync", (response)=>{
                console.log(response);
            }, "GET", null);
        }
    },
    computed: {
      saved_instances: function(){
          for(let i  = 0; i < instances_table.instances.length; i++){
              for(let j = 0; j < payloads_table.profiles.length; j++){
                  if(payloads_table.profiles[j]['name'] === instances_table.instances[i]['c2_profile']){
                      if(!payloads_table.profiles[j].hasOwnProperty('instances')){
                          payloads_table.profiles[j]['instances'] = {};
                      }
                      payloads_table.profiles[j]['instances'][instances_table.instances[i]['instance_name']] = instances_table.instances[i];
                  }
              }
          }
      }
    },
    delimiters: ['[[',']]']
});
function passing_requirements(val){
    if(val.required === false){ return true}
    let regex = RegExp(val['verifier_regex']);
    if(val.hasOwnProperty('value')){
        return regex.test(val['value']);
    }else{
        return regex.test(val['parameter']);
    }

}
function create_new_parameter_instance_callback(response){
    try{
        data = JSON.parse(response);
    }catch(error){
        alertTop("danger", "Session expired, please refresh");
        return;
    }
    if(data['status'] === 'error'){
        alertTop("danger", data['error']);
    }else{
        alertTop("success", "Created new instance");
    }
    httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/parameter_instances", get_parameter_instance_callback, "GET", null);
}
function get_parameter_instance_callback(response){
    try{
        data = JSON.parse(response);
    }catch(error){
        alertTop("danger", "Session expired, please refresh");
        return;
    }
    if(data['status'] === 'error'){
        alertTop("danger", data['error']);
        return;
    }
    instances_table.instances = [];
    let i = 0;
    Object.keys(data['instances']).forEach(function(k){
        instances_table.instances.push({"instance_name": k,
                                        "c2_profile": data['instances'][k][0]['c2_profile'],
                                        "values": data['instances'][k],
                                        "id":i});
        i++;
        for(let j = 0; j < payloads_table.profiles.length; j++){
          if(payloads_table.profiles[j]['name'] === data['instances'][k][0]['c2_profile']){
              if(!payloads_table.profiles[j].hasOwnProperty('instances')){
                  payloads_table.profiles[j]['instances'] = {};
              }
              payloads_table.profiles[j]['instances'][k] = i;
          }
      }
    });
    payloads_table.$forceUpdate();
}
function check_status_callback(response){
    try{
        data = JSON.parse(response);
    }catch(error){
        alertTop("danger", "Session expired, please refresh");
        return;
    }
    if(data['status'] === 'error'){
        alertTop("danger", data['error']);
    }
}
var profile_files_modal = new Vue({
    el: '#profileFilesModal',
    data: {
        profile_name: "",
        profile_id: "",
        language: "json",
        code: "",
        theme: "{{config['code-theme']}}",
        theme_options: ["monokai", "ambiance", "chaos", "terminal", "xcode", "crimson_editor"]
    },
    methods: {
        set_to_blanks: function(){
            this.code = "";
            this.profile_name = "";
            this.profile_id = "";
        },
        send_to_edit_container: function(folder, file){
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + this.profile_id + "/files/container_download", (response)=>{
                try{
                    let data = JSON.parse(response);
                    if(data['status'] === 'error'){
                        alertTop("warning", data['error']);
                    }
                }catch(error){
                    console.log(error.toString());
                    alertTop("danger", "Session expired, please refresh");
                }
            }, "POST", {"folder": folder, "file": file});
        },
        save_changes: function(){
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + this.profile_id + "/upload", (response) => {
                try {
                    let data = JSON.parse(response);
                    if (data['status'] === 'error') {
                        alertTop("warning", data['error']);
                    } else {
                        //this means the folder was successfully created, so update the UI to match
                        alertTop("info", "Sent to container...");
                    }
                } catch (error) {
                    alertTop("danger", "Session expired, please refresh");
                }
            }, "POST", {"file_name": this.filename, "folder": this.folder, "code": btoa(profile_files_modal.code), "payload_type": ""});

        },
    },
    delimiters: ['[[',']]']
});
var edit_payload_file_list = [];
var edit_payload_files = new Vue({
    el: '#profileUpdateBody',
    data: {
        edit_payload_file_list: [],
        name: "",
        description: "",
        author: "",
        externally_hosted: false,
        is_p2p: false,
        is_server_routed: false,
        mythic_encrypts: true
    },
    methods: {
        reset: function(){
            this.name = "";
            this.edit_payload_file_list = [];
            this.description = "";
            this.author = "";
            this.externally_hosted = false;
            this.is_p2p = false;
            this.is_server_routed = false;
            this.mythic_encrypts = true;
        }
    },
    delimiters: ['[[', ']]']
});
function update_profile(response){
	try{
        data = JSON.parse(response);
    }catch(error){
        alertTop("danger", "Session expired, please refresh");
        return;
    }
	if(data['status'] === 'success'){
		for( let i = 0; i < profiles.length; i++){
		    if(payloads_table.profiles[i].id === data['id']){
		        payloads_table.profiles[i] = data;
		        payloads_table.$forceUpdate();
		        //payloads_table.profiles[i].name = data['name'];
		        //payloads_table.profiles[i].description = data['description'];
		        //payloads_table.profiles[i].payload_types = data['payload_types'];
		        //payloads_table.profiles[i].running = data['running'];
		    }
		}
		alertTop("success", "Successfully updated");
	}
	else{
		//there was an error, so we should tell the user
		alertTop("danger", "Error: " + data['error']);
	}
}
function update_profile_running(response){
    try{
        data = JSON.parse(response);
    }catch(error){
        alertTop("danger", "Session expired, please refresh");
        return;
    }
	if(data['status'] === 'error'){
		alertTop("danger", data['error']);
	}
}
function delete_profile(response){
	try{
        data = JSON.parse(response);
    }catch(error){
        alertTop("danger", "Session expired, please refresh");
        return;
    }
	if(data['status'] === 'success'){
		for(let i = 0; i < profiles.length; i++){
		    if(payloads_table.profiles[i].name === data['name']){
		        payloads_table.profiles.splice(i, 1);
		        break;
		    }
		}

	}
	else{
		//there was an error, so we should tell the user
		alertTop("danger", "Error: " + data['error']);
	}
}
function startwebsocket_c2profiles(){
	var ws = new WebSocket('{{ws}}://{{links.server_ip}}:{{links.server_port}}/ws/c2profiles');
	ws.onmessage = function(event){
	    if(event.data === "no_operation"){
	        alertTop("warning", "No operation selected");
        }
		else if(event.data !== ""){
			let pdata = JSON.parse(event.data);
			//console.log(pdata);
			for(let i = 0; i < payloads_table.profiles.length; i++){
			    if(payloads_table.profiles[i]['id'] === pdata['id']){
			        if(pdata['deleted']){
                        payloads_table.profiles.splice(i, 1);
                    }else{
			             Vue.set(payloads_table.profiles, i, Object.assign({}, payloads_table.profiles[i], pdata));
                    }
			        return;
			    }
			}
			pdata['payload_types'] = [];
			payloads_table.profiles.push(pdata);
			payloads_table.profiles.sort((a,b) => (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0));
		}
		else{
		    if(finished_profiles === false){
		        finished_profiles = true;
		        startwebsocket_payloadtypec2profile();
		        httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/parameter_instances", get_parameter_instance_callback, "GET", null);
		    }
		}
	};
	ws.onclose = function(event){
		wsonclose(event);
	};
	ws.onerror = function(event){
        wsonerror(event);
	};
}
function startwebsocket_payloadtypec2profile(){
	var ws = new WebSocket('{{ws}}://{{links.server_ip}}:{{links.server_port}}/ws/payloadtypec2profile');
	ws.onmessage = function(event){
	    if(event.data === "no_operation"){
	        alertTop("warning", "No operation selected");
        }
		else if(event.data !== ""){
			let pdata = JSON.parse(event.data);
			//profiles.push(pdata);
            for(let i = 0; i < profiles.length; i++){
                if(profiles[i]['id'] === pdata['c2_profile_id']){
                    if( !profiles[i]['payload_types'].includes(pdata['payload_type'])){
                        profiles[i]['payload_types'].push(pdata['payload_type']);
                    }
                }
            }
		}
	};
	ws.onclose = function(event){
		wsonclose(event);
	};
	ws.onerror = function(event){
        wsonerror(event);
	};
}
function startwebsocket_rabbitmqresponses(){
    var ws = new WebSocket("{{ws}}://{{links.server_ip}}:{{links.server_port}}/ws/rabbitmq/c2_status");
    ws.onmessage = function(event){
        if(event.data === "no_operation"){
	        alertTop("warning", "No operation selected");
        }
		else if(event.data !== ""){
		    let rdata = JSON.parse(event.data);
		    //console.log(rdata);
		    let pieces = rdata['routing_key'].split(".");
		    //console.log(rdata['body']);
		    //console.log(pieces);
            //{"status": "success", "body": "C2 is not running", "routing_key": "c2.status.RESTful Patchthrough.stopped"}
			if(rdata['status'] === "success"){
			    if(pieces[4] === "get_config"){
			        let data = JSON.parse(rdata['body']);
			        //clearAlertTop();
                    profile_files_modal.code = atob(data['data']);
			    }
			    else if(pieces[4] === "writefile"){
			        let data = JSON.parse(rdata['body']);
			        if(data['status'] === 'success'){
			            alertTop("success", "File written");
                    }else{
			            alertTop("warning", data['error']);
                    }
                }
			    else if(pieces[4] === "status" || pieces[4] === "stop" || pieces[4] === "start"){
			        if(rdata['body'].length > 512000){
                        download_from_memory("c2_status_output.txt", btoa(rdata['body']));
                    }else{
			            $('#stdoutStderrModal').modal('show');
			            $('#stdoutstderrText').text(rdata['body']);
                    }
			    }
			}else{
			    alertTop("danger", rdata['error']);
			}
			//console.log(event.data);
            pieces = rdata['routing_key'].split(".");
			for( let i = 0; i < profiles.length; i++){
                if(payloads_table.profiles[i].name === pieces[2]){
                    payloads_table.profiles[i].running = pieces[3] === "running";
                    return;
                }
            }
		}
	};
	ws.onclose = function(event){
		wsonclose(event);
	};
	ws.onerror = function(event){
        wsonerror(event);
	};
}
startwebsocket_rabbitmqresponses();
var payload_file_list = [];
startwebsocket_c2profiles();
function startwebsocket_events() {
    let ws = new WebSocket('{{ws}}://{{links.server_ip}}:{{links.server_port}}/ws/events_new/current_operation');
    ws.onmessage = function (event) {
        if(event.data === "no_operation"){
	        alertTop("warning", "No operation selected");
        }
        else if (event.data !== "") {
            let data = JSON.parse(event.data);
            alertTop("info",  data['message'], 4, data['operator']);
        }
    };
    ws.onclose = function (event) {
        wsonclose(event);
    };
    ws.onerror = function (event) {
        wsonerror(event);
    };
}startwebsocket_events();
function container_heartbeat_check(){
    let date = new Date();
    let now = date.getTime() + date.getTimezoneOffset() * 60000;
    for(let i = 0; i < payloads_table.profiles.length; i ++){
        let heartbeat = new Date(payloads_table.profiles[i].last_heartbeat);
        let difference =  (now - heartbeat.getTime() ) / 1000;
        if(difference < 30){
            payloads_table.profiles[i]['container_running'] = true;
        }else{
            if(payloads_table.profiles[i]['container_running'] === true){
                // if it's currently set to running, let's change it in the db that it's down
                httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + payloads_table.profiles[i]['id'], null, "PUT", {"container_running": false});
            }
            payloads_table.profiles[i]['container_running'] = false;
        }
    }
}
setInterval(container_heartbeat_check, 500);
var instances_table = new Vue({
    el: '#instances_table',
    data: {
        instances: [],
        current_parameters: [],  // for creating a new instance
        current_name: "",  // for creating a new instance
        c2_profile: ""
    },
    methods: {
        delete_instance: function(i){
            httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/parameter_instances/" + i['instance_name'], create_new_parameter_instance_callback, "DELETE", null);
        },
        download_instance: function(i){
            let data = JSON.stringify(i);
            download_from_memory(i.instance_name + ".json", btoa(data));
        },
        import_instance: function(){
            $('#importInstanceModal').modal('show');
            $( '#importInstanceSubmit' ).unbind('click').click(function(){
                let file = document.getElementById('importInstanceFile');
                let filedata = file.files[0];
                let fileReader = new FileReader();
                  fileReader.onload = function(fileLoadedEvent){
                      try {
                          let i = JSON.parse(fileLoadedEvent.target.result);
                          instances_table.current_parameters = [];
                          instances_table.current_name = i.instance_name + " copy";
                          i.values.forEach((x) => {
                              instances_table.current_parameters.push({
                                  "description": x.description,
                                  "name": x.name,
                                  "default_value": x.value
                              });
                          });
                          // for each one we get back, create a new row
                          //    this will be in the form of a Vue object we modify
                          $('#profileCreateInstanceModal').modal('show');
                          $('#profileCreateInstanceModal').on('shown.bs.modal', function () {
                                instances_table.current_parameters.forEach((x)=>{
                                   adjust_size( document.getElementById(x.key));
                                });
                            });
                          $('#profileCreateInstanceSubmit').unbind('click').click(function () {
                              // We now have a mix of old, new, modified, and deleted parameters
                              let data = {'instance_name': instances_table.current_name};
                              for (let j = 0; j < instances_table.current_parameters.length; j++) {
                                  data[instances_table.current_parameters[j]['name']] = instances_table.current_parameters[j]['hint'];
                              }
                              httpGetAsync("{{http}}://{{links.server_ip}}:{{links.server_port}}{{links.api_base}}/c2profiles/" + i.c2_profile + "/parameter_instances", create_new_parameter_instance_callback, "POST", data);
                          });
                      }catch(error){
                          alertTop("danger", "Failed to import file: " + error.toString());
                      }
                  };
                  fileReader.readAsText(filedata, "UTF-8");
                file.value = file.defaultValue;
            });
        },
        instance_options: function(){
            return this.instances.filter(x => x.c2_profile === instances_table.c2_profile);
        }
    },
    watch: {
      current_name: function(val){
          for(let i = 0; i < this.instances.length; i++){
              if(this.instances[i]['instance_name'] === val){
                  this.current_parameters = Object.assign([], this.instances[i]['values']);
                  instances_table.current_parameters.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
              }
          }
      }
    },
    delimiters: ['[[', ']]'],
});
//ACE specific code from http://cwestblog.com/2018/08/04/ace-editor-vue-component/
/* START: <ace-editor> Vue component */
(function () {
  var PROPS = {
    selectionStyle: {},
    highlightActiveLine: { f: toBool },
    highlightSelectedWord: { f: toBool },
    readOnly: { f: toBool },
    cursorStyle: {},
    mergeUndoDeltas: { f: toBool },
    behavioursEnabled: { f: toBool },
    wrapBehavioursEnabled: { f: toBool },
    autoScrollEditorIntoView: { f: toBool, v: false },
    copyWithEmptySelection: { f: toBool },
    useSoftTabs: { f: toBool, v: false },
    navigateWithinSoftTabs: { f: toBool, v: false },
    hScrollBarAlwaysVisible: { f: toBool },
    vScrollBarAlwaysVisible: { f: toBool },
    highlightGutterLine: { f: toBool },
    animatedScroll: { f: toBool },
    showInvisibles: { f: toBool, v: true },
    showPrintMargin: { f: toBool },
    printMarginColumn: { f: toNum, v: 80 },
    // shortcut for showPrintMargin and printMarginColumn
    printMargin: { f: function (x) { return toBool(x, true) && toNum(x); } }, // false|number
    fadeFoldWidgets: { f: toBool },
    showFoldWidgets: { f: toBool, v: true },
    showLineNumbers: { f: toBool, v: true },
    showGutter: { f: toBool, v: true },
    displayIndentGuides: { f: toBool, v: true },
    fontSize: {},
    fontFamily: {},
    minLines: { f: toNum },
    maxLines: { f: toNum },
    scrollPastEnd: { f: toBoolOrNum },
    fixedWidthGutter: { f: toBool, v: false },
    theme: { v: 'monokai' },
    scrollSpeed: { f: toNum },
    dragDelay: { f: toNum },
    dragEnabled: { f: toBool, v: true },
    focusTimeout: { f: toNum },
    tooltipFollowsMouse: { f: toBool },
    firstLineNumber: { f: toNum, v: 1 },
    overwrite: { f: toBool },
    newLineMode: {},
    useWorker: { f: toBool },
    tabSize: { f: toNum, v: 2 },
    wrap: { f: toBoolOrNum, v: false },
    foldStyle: { v: 'markbegin' },
    mode: { v: 'javascript' },
    value: {},
  };

  var EDITOR_EVENTS = ['blur', 'change', 'changeSelectionStyle', 'changeSession', 'copy', 'focus', 'paste'];

  var INPUT_EVENTS = ['keydown', 'keypress', 'keyup'];

  function toBool(value, opt_ignoreNum) {
    var result = value;
    if (result != null) {
      (value + '').replace(
        /^(?:|0|false|no|off|(1|true|yes|on))$/,
        function(m, isTrue) {
          result = (/01/.test(m) && opt_ignoreNum) ? result : !!isTrue;
        }
      );
    }
    return result;
  }

  function toNum(value) {
    return (value == null || isNaN(+value)) ? value : +value;
  }

  function toBoolOrNum(value) {
    var result = toBool(value, true);
    return 'boolean' === typeof result ? result : toNum(value);
  }

  function emit(component, name, event) {
    component.$emit(name.toLowerCase(), event);
    if (name !== name.toLowerCase()) {
      component.$emit(
        name.replace(/[A-Z]+/g, function(m) { return ('-' + m).toLowerCase(); }),
        event
      );
    }
  }

  // Defined for IE11 compatibility
  function entries(obj) {
    return Object.keys(obj).map(function(key) { return [key, obj[key]]; });
  }

  Vue.component('aceEditor', {
    template: '<div ref="root"></div>',
    props: Object.keys(PROPS),
    data: function() {
      return {
        editor: null,
        isShowingError: false,
        isShowingWarning: false,
        allowInputEvent: true,
        // NOTE:  "lastValue" is needed to prevent cursor from always going to
        // the end after typing
        lastValue: ''
      };
    },
    methods: {
      setOption: function(key, value) {
        var func = PROPS[key].f;

        value = /^(theme|mode)$/.test(key)
          ? 'ace/' + key + '/' + value
          : func
            ? func(value)
            : value;

        this.editor.setOption(key, value);
      }
    },
    watch: (function () {
      var watch = {
        value: function(value) {
          if (this.lastValue !== value) {
            this.allowInputEvent = false;
            this.editor.setValue(value);
            this.allowInputEvent = true;
          }
        }
      };

      return entries(PROPS).reduce(
        function(watch, propPair) {
          var propName = propPair[0];
          if (propName !== 'value') {
            watch[propName] = function (newValue) {
              this.setOption(propName, newValue);
            };
          }
          return watch;
        },
        watch
      );
    })(),
    mounted: function() {
      var self = this;

      self.editor = window.ace.edit(self.$refs.root, { value: self.value });

      entries(PROPS).forEach(
        function(propPair) {
          var propName = propPair[0],
              prop = propPair[1],
              value = self.$props[propName];
          if (value !== undefined || prop.hasOwnProperty('v')) {
            self.setOption(propName, value === undefined ? prop.v : value);
          }
        }
      );

      self.editor.on('change', function(e) {
        self.lastValue = self.editor.getValue();
        if (self.allowInputEvent) {
          emit(self, 'input', self.lastValue);
        }
      });

      INPUT_EVENTS.forEach(
        function(eName) {
          self.editor.textInput.getElement().addEventListener(
            eName, function(e) { emit(self, eName, e); }
          );
        }
      );

      EDITOR_EVENTS.forEach(function(eName) {
        self.editor.on(eName, function(e) { emit(self, eName, e); });
      });

      var session = self.editor.getSession();
      session.on('changeAnnotation', function() {
        var annotations = session.getAnnotations(),
            errors = annotations.filter(function(a) { return a.type === 'error'; }),
            warnings = annotations.filter(function(a) { return a.type === 'warning'; });

        emit(self, 'changeAnnotation', {
          type: 'changeAnnotation',
          annotations: annotations,
          errors: errors,
          warnings: warnings
        });

        if (errors.length) {
          emit(self, 'error', { type: 'error', annotations: errors });
        }
        else if (self.isShowingError) {
          emit(self, 'errorsRemoved', { type: 'errorsRemoved' });
        }
        self.isShowingError = !!errors.length;

        if (warnings.length) {
          emit(self, 'warning', { type: 'warning', annotations: warnings });
        }
        else if (self.isShowingWarning) {
          emit(self, 'warningsRemoved', { type: 'warningsRemoved' });
        }
        self.isShowingWarning = !!warnings.length;
      });
    }
  });
})();
/* END: <ace-editor> Vue component */