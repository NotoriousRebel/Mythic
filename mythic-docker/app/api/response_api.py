from app import mythic, db_objects
from sanic.response import json
from app.database_models.model import Task, Response, Callback, Keylog, TaskArtifact, Artifact, Command
from sanic_jwt.decorators import scoped, inject_user
from app.api.file_api import create_filemeta_in_database_func, download_file_to_disk_func
from app.api.credential_api import create_credential_func
import json as js
import datetime
import app.database_models.model as db_model
import sys
from sanic.exceptions import abort
from math import ceil
from sanic.log import logger
from peewee import fn


# This gets all responses in the database
@mythic.route(mythic.config['API_BASE'] + "/responses/", methods=['GET'])
@inject_user()
@scoped(['auth:user', 'auth:apitoken_user'], False)  # user or user-level api token are ok
async def get_all_responses(request, user):
    if user['auth'] not in ['access_token', 'apitoken']:
        abort(status_code=403, message="Cannot access via Cookies. Use CLI or access via JS in browser")
    try:
        responses = []
        query = await db_model.operation_query()
        operation = await db_objects.get(query, name=user['current_operation'])
        query = await db_model.callback_query()
        callbacks = await db_objects.execute(query.where(Callback.operation == operation))
        for c in callbacks:
            query = await db_model.task_query()
            tasks = await db_objects.prefetch(query.where(Task.callback == c), Command.select())
            for t in tasks:
                query = await db_model.response_query()
                task_responses = await db_objects.execute(query.where(Response.task == t))
                responses += [r.to_json() for r in task_responses]
    except Exception as e:
        return json({'status': 'error',
                     'error': 'Cannot get responses: ' + str(e)})
    return json(responses)


@mythic.route(mythic.config['API_BASE'] + "/responses/by_task/<id:int>", methods=['GET'])
@inject_user()
@scoped(['auth:user', 'auth:apitoken_user'], False)  # user or user-level api token are ok
async def get_all_responses_for_task(request, user, id):
    if user['auth'] not in ['access_token', 'apitoken']:
        abort(status_code=403, message="Cannot access via Cookies. Use CLI or access via JS in browser")
    try:
        query = await db_model.operation_query()
        operation = await db_objects.get(query, name=user['current_operation'])
        query = await db_model.task_query()
        task = await db_objects.get(query, id=id)
    except Exception as e:
        return json({'status': 'error', 'error': 'failed to get operation or task'})
    query = await db_model.response_query()
    responses = await db_objects.execute(query.where(Response.task == task).order_by(Response.id))
    return json([r.to_json() for r in responses])


# Get a single response
@mythic.route(mythic.config['API_BASE'] + "/responses/<id:int>", methods=['GET'])
@inject_user()
@scoped(['auth:user', 'auth:apitoken_user'], False)  # user or user-level api token are ok
async def get_one_response(request, user, id):
    if user['auth'] not in ['access_token', 'apitoken']:
        abort(status_code=403, message="Cannot access via Cookies. Use CLI or access via JS in browser")
    try:
        query = await db_model.response_query()
        resp = await db_objects.get(query, id=id)
        query = await db_model.callback_query()
        cb = await db_objects.get(query.where(Callback.id == resp.task.callback))
        if cb.operation.name == user['current_operation']:
            return json(resp.to_json())
        else:
            return json({'status': 'error', 'error': 'that task isn\'t in your current operation'})
    except Exception as e:
        return json({'status': 'error', 'error': 'Cannot get that response'})


@mythic.route(mythic.config['API_BASE'] + "/responses/search", methods=['POST'])
@inject_user()
@scoped(['auth:user', 'auth:apitoken_user'], False)  # user or user-level api token are ok
async def search_responses(request, user):
    if user['auth'] not in ['access_token', 'apitoken']:
        abort(status_code=403, message="Cannot access via Cookies. Use CLI or access via JS in browser")
    try:
        data = request.json
        if 'search' not in data:
            return json({'status': 'error', 'error': 'failed to find search term in request'})
        query = await db_model.operation_query()
        operation = await db_objects.get(query, name=user['current_operation'])
    except Exception as e:
        return json({'status': 'error', 'error': 'Cannot get that response'})
    try:
        query = await db_model.task_query()
        count = await db_objects.count(query.join(Response).switch(Response).where(fn.encode(Response.response, 'escape').regexp(data['search'])).switch(Task).where(Callback.operation == operation).order_by(Task.id).distinct())
        if 'page' not in data:
            # allow a blanket search to still be performed
            responses = await db_objects.execute(query.join(Response).switch(Response).where(fn.encode(Response.response, 'escape').regexp(data['search'])).switch(Task).where(Callback.operation == operation).order_by(Task.id).distinct())
            data['page'] = 1
            data['size'] = count
        else:
            if 'page' not in data or 'size' not in data or int(data['size']) <= 0 or int(data['page']) <= 0:
                return json({'status': 'error', 'error': 'size and page must be supplied and be greater than 0'})
            data['size'] = int(data['size'])
            data['page'] = int(data['page'])
            if data['page'] * data['size'] > count:
                data['page'] = ceil(count / data['size'])
                if data['page'] == 0:
                    data['page'] = 1
            responses = await db_objects.execute(
                query.join(Response).switch(Response).where(
                    fn.encode(Response.response, 'escape').regexp(data['search'])).switch(Task).where(
                    Callback.operation == operation).order_by(Task.id).distinct().paginate(data['page'], data['size'])
            )
        output = []
        response_query = await db_model.response_query()
        for r in responses:
            setup = await db_objects.execute(response_query.where(Response.task == r).order_by(Response.id))
            output.append({**r.to_json(), 'response': [s.to_json() for s in setup]})
        return json({'status': 'success', 'output': output, 'total_count': count, 'page': data['page'], 'size': data['size']})
    except Exception as e:
        print(str(e))
        return json({'status': 'error', 'error': 'bad regex syntax'})


async def post_agent_response(agent_message, UUID):
    # { INPUT
    # "action": "post_response",
    # "responses": [
    #    {
    #      "task_id": "uuid of task",
    #      ... response parameters
    #     }
    #   ]
    # }
    # { RESPONSE
    #   "action": "post_response",
    #   "responses": [
    #       {
    #           "task_id": "success" or "error",
    #           "error": "error message if task_id is error"
    #           ...: ... // additional data as needed, such as file_id
    #       }
    #   ]
    # }
    response_message = {"action": "post_response", "responses": []}

    for r in agent_message['responses']:
        print(r)
        try:
            task_id = r['task_id']
            del r['task_id']
            parsed_response = r
            try:
                query = await db_model.task_query()
                task = await db_objects.get(query, agent_task_id=task_id)
                query = await db_model.callback_query()
                callback = await db_objects.get(query, id=task.callback.id)
                # update the callback's last checkin time since it just posted a response
                callback.last_checkin = datetime.datetime.utcnow()
                callback.active = True  # always set this to true regardless of what it was before because it's clearly active
                await db_objects.update(callback)  # update the last checkin time
            except Exception as e:
                logger.exception("Failed to find callback or task: " + str(e))
                response_message['responses'].append({task_id: 'error', 'error': 'failed to find task or callback'})
                continue
            resp = None  # declare the variable now so we can tell if we already created a response later
            json_return_info = {'status': 'success', 'task_id': task_id}
            final_output = ""  # we're resetting it since we're going to be doing some processing on the response
            try:
                if task.command.is_process_list:
                    # save this data off as a process list object in addition to doing whatever normally
                    # this might be chunked, so see if one already exists for this task and just add to it, or create a new one
                    try:
                        query = await db_model.processlist_query()
                        pl = await db_objects.get(query, task=task)
                        pl.process_list += parsed_response['user_output'].encode('unicode-escape')
                        pl.timestamp = datetime.datetime.utcnow()
                        await db_objects.update(pl)
                    except Exception as e:
                        await db_objects.create(db_model.ProcessList, task=task, host=callback.host,
                                                process_list=parsed_response['user_output'].encode('unicode-escape'), operation=callback.operation)
                try:
                    if 'completed' in parsed_response and parsed_response['completed']:
                        task.completed = True
                        json_return_info = {**json_return_info, "status": "success"}
                    if 'user_output' in parsed_response:
                        final_output += str(parsed_response['user_output'])
                    if 'file_browser' in parsed_response and parsed_response['file_browser'] != {} and parsed_response['file_browser'] is not None:
                        # load this information into filebrowserobj entries for later parsing
                        from app.api.file_browser_api import store_response_into_filebrowserobj
                        status = await store_response_into_filebrowserobj(callback.operation, task, parsed_response['file_browser'])
                        json_return_info = {**json_return_info, **status}
                    if 'removed_files' in parsed_response:
                        # an agent is reporting back that a file was removed from disk successfully
                        filebrowserquery = await db_model.filebrowserobj_query()
                        for f in parsed_response['removed_files']:
                            if 'host' not in f or f['host'] == "":
                                f['host'] = callback.host
                            # we want to see if there's a filebrowserobj that matches up with the removed files
                            try:
                                fobj = await db_objects.get(filebrowserquery, operation=callback.operation, host=f['host'].encode('unicode-escape'),
                                                            full_path=f['path'].encode('unicode-escape'), deleted=False)
                                fobj.deleted = True
                                await db_objects.update(fobj)
                            except Exception as e:
                                pass
                    if 'total_chunks' in parsed_response and str(parsed_response['total_chunks']) != "":
                        # we're about to create a record in the db for a file that's about to be send our way
                        parsed_response['task'] = task.id
                        rsp = await create_filemeta_in_database_func(parsed_response)
                        if rsp['status'] == "success":
                            # update the response to indicate we've created the file meta data
                            rsp.pop('status', None)  # remove the status key from the dictionary
                            final_output += js.dumps(rsp, sort_keys=True, indent=2, separators=(',', ': ')).encode('unicode-escape', errors='backslashreplace').decode('utf-8', errors="backslashreplace")
                            resp = await db_objects.create(Response, task=task, response=final_output)
                            task.status = "processed"
                            task.timestamp = datetime.datetime.utcnow()
                            await db_objects.update(task)
                            json_return_info = {**json_return_info, 'file_id': rsp['agent_file_id']}
                        else:
                            final_output = rsp['error']
                            json_return_info = {**json_return_info, 'status': 'error', 'error': rsp['error']}
                    if 'chunk_data' in parsed_response and str(parsed_response['chunk_data']) != "":
                        if 'file_id' not in parsed_response and 'file_id' in json_return_info:
                            # allow agents to post the initial chunk data with initial metadata
                            parsed_response['file_id'] = json_return_info['file_id']
                        rsp = await download_file_to_disk_func(parsed_response)
                        if rsp['status'] == "error":
                            final_output += rsp['error']
                        else:
                            # we successfully got a chunk and updated the FileMeta object, so just move along
                            json_return_info = {**json_return_info, 'status': 'success'}
                        parsed_response.pop('chunk_num', None)
                        parsed_response.pop('file_id', None)
                        parsed_response.pop('chunk_data', None)
                    if "window_title" in parsed_response and "user" in parsed_response and "keystrokes" in parsed_response:
                        if parsed_response['window_title'] is None or parsed_response['window_title'] == "":
                            parsed_response['window_title'] = "UNKNOWN"
                        if parsed_response['user'] is None or parsed_response['user'] == "":
                            parsed_response['user'] = "UNKNOWN"
                        if parsed_response['keystrokes'] is None or parsed_response['keystrokes'] == "":
                            json_return_info = {**json_return_info, 'status': 'error', 'error': 'keylogging response has no keystrokes'}
                        else:
                            rsp = await db_objects.create(Keylog, task=task, window=parsed_response['window_title'],
                                                           keystrokes=parsed_response['keystrokes'], operation=callback.operation,
                                                           user=parsed_response['user'])
                            json_return_info = {**json_return_info, 'status': 'success'}
                        parsed_response.pop('window_title', None)
                        parsed_response.pop('user', None)
                        parsed_response.pop('keystrokes', None)
                    if 'credentials' in parsed_response and str(parsed_response['credentials']) != "":
                        total_creds_added = 0
                        total_repeats = 0
                        for cred in parsed_response['credentials']:
                            cred['task'] = task
                            new_cred_status = await create_credential_func(task.operator, callback.operation, cred)
                            if new_cred_status['status'] == "success" and new_cred_status['new']:
                                total_creds_added = total_creds_added + 1
                            elif new_cred_status['status'] == 'success':
                                total_repeats = total_repeats + 1
                        #final_output += "\nAdded {} new credentials\n".format(str(total_creds_added))
                        parsed_response.pop('credentials', None)
                    if 'artifacts' in parsed_response and str(parsed_response['artifacts']) != "":
                        # now handle the case where the agent is reporting back artifact information
                        for artifact in parsed_response['artifacts']:
                            try:
                                try:
                                    query = await db_model.artifact_query()
                                    base_artifact = await db_objects.get(query, name=artifact['base_artifact'])
                                except Exception as e:
                                    base_artifact = await db_objects.create(Artifact, name=artifact['base_artifact'], description="Auto created from task {}".format(task.id))
                                # you can report back multiple artifacts at once, no reason to make separate C2 requests
                                await db_objects.create(TaskArtifact, task=task, artifact_instance=str(artifact['artifact']),
                                                        artifact=base_artifact, host=task.callback.host)
                                #final_output += "\nAdded artifact {}".format(str(artifact['artifact']))
                                json_return_info = {**json_return_info, "status": "success"}
                            except Exception as e:
                                final_output += "\nFailed to work with artifact: " + str(artifact) + " due to: " + str(e)
                                json_return_info = {**json_return_info, 'status': 'error', 'error': final_output}
                        parsed_response.pop('artifacts', None)
                    if 'status' in parsed_response and parsed_response['status'] != "" and parsed_response['status'] is not None:
                        task.status = str(parsed_response['status']).lower()
                        parsed_response.pop('status', None)
                    if 'full_path' in parsed_response and 'file_id' in parsed_response and parsed_response['file_id'] != "" and parsed_response['full_path'] != "":
                        # updating the full_path field of a file object after the initial checkin for it
                        try:
                            query = await db_model.filemeta_query()
                            file_meta = await db_objects.get(query, agent_file_id=parsed_response['file_id'])
                            if file_meta.task is None or file_meta.task != task:
                                #print("creating new file")
                                f = await db_objects.create(db_model.FileMeta, task=task,
                                                        total_chunks=file_meta.total_chunks,
                                                        chunks_received=file_meta.chunks_received,
                                                        chunk_size=file_meta.chunk_size, complete=file_meta.complete,
                                                        path=file_meta.path, full_remote_path=parsed_response['full_path'],
                                                        operation=callback.operation, md5=file_meta.md5,
                                                        sha1=file_meta.sha1, temp_file=False,
                                                        deleted=False, operator=task.operator)
                                #print(f)
                            else:
                                #print("updating file")
                                if file_meta.full_remote_path is None or file_meta.full_remote_path == "":
                                    file_meta.full_remote_path = parsed_response['full_path']
                                else:
                                    file_meta.full_remote_path = file_meta.full_remote_path + "," + parsed_response['full_path']
                                await db_objects.update(file_meta)
                        except Exception as e:
                            print(str(e))
                            logger.exception("Tried to update the full path for a file that can't be found: " + parsed_response['file_id'])
                        parsed_response.pop('full_path', None)
                        parsed_response.pop('file_id', None)
                    if 'edges' in parsed_response and parsed_response['edges'] != "" and parsed_response['edges'] != []:
                        try:
                            from app.api.callback_api import add_p2p_route
                            rsp = await add_p2p_route(parsed_response['edges'], callback, task)
                        except Exception as e:
                            print(str(e))
                            rsp = {'status': 'error', 'error': str(e)}
                        json_return_info = {**json_return_info, **rsp}
                        parsed_response.pop('edges', None)
                    # go through to make sure we remove blank fields that were sent
                    parsed_response.pop('full_path', None)
                    parsed_response.pop('status', None)
                    parsed_response.pop('completed', None)
                    parsed_response.pop('is_screenshot', None)
                    parsed_response.pop('error', None)
                    parsed_response.pop('total_chunks', None)
                    parsed_response.pop('chunk_num', None)
                    parsed_response.pop('chunk_data', None)
                    parsed_response.pop('file_id', None)
                    parsed_response.pop('credentials', None)
                    parsed_response.pop('artifacts', None)
                    parsed_response.pop('edges', None)
                    parsed_response.pop('window_title', None)
                    parsed_response.pop('keystrokes', None)
                    parsed_response.pop('user', None)
                    parsed_response.pop('user_output', None)
                    parsed_response.pop('file_browser', None)
                    parsed_response.pop('removed_files', None)
                except Exception as e:
                    print(sys.exc_info()[-1].tb_lineno)
                    final_output += "Failed to process a JSON-based response with error: " + str(e) + " on " + str(sys.exc_info()[-1].tb_lineno) + "\nOriginal Output:\n" + str(r)
                    json_return_info = {**json_return_info, 'status': 'error', 'error': str(e)}
            except Exception as e:
                # response is not json, so just process it as normal
                print(str(e))
                pass
            # echo back any values that the agent sent us that don't match something we're expecting
            json_return_info = {**json_return_info, **parsed_response}
            if resp is None:
                # we need to check for the case where the response is JSON, but doesn't conform to any of our keywords
                if final_output != "":
                    # if we got here, then we did some sort of meta processing
                    resp = await db_objects.create(Response, task=task, response=final_output.encode('unicode-escape'))
                if task.status != "error":
                    task.status = "processed"
            if task.status_timestamp_processed is None:
                task.status_timestamp_processed = datetime.datetime.utcnow()
            task.timestamp = datetime.datetime.utcnow()
            await db_objects.update(task)
            response_message['responses'].append(json_return_info)
        except Exception as e:
            response_message['responses'].append({
                "status": "error",
                "error": str(e),
                "task_id": r['task_id'] if 'task_id' in r else ""
            })
    if 'socks' in agent_message and agent_message['socks'] != "" and agent_message['socks'] != []:
        from app.api.callback_api import send_socks_data
        query = await db_model.callback_query()
        callback = await db_objects.get(query, agent_callback_id=UUID)
        await send_socks_data(agent_message['socks'], callback)
        agent_message.pop('socks', None)
    # echo back any additional parameters here as well
    for k in agent_message:
        if k not in ['action', 'responses', 'delegates', 'socks']:
            response_message[k] = agent_message[k]
    return response_message
