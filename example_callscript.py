import requests
from os import environ

URL = 'http://localhost:8080'

if __name__ == '__main__':
    authorization = f'bearer {environ["AUTH"]}'
    headers = {
        'Authorization': authorization,
        'Content-Type': 'application/json',
    }
    params = {
    'gsheetid': environ['GSHEETID'],
    }
    response = requests.get(URL, headers=headers, params=params)
    print("Get Response")
    print(response.json())

    print("Post Response")
    data = ["Foo", "Bar"]
    params["data"] = data
    response = requests.post(URL, headers=headers, json=params)
    print(response.json())

    print("Post response with sheetname")
    params["sheetname"] = "Sheet2"
    response = requests.post(URL, headers=headers, json=params)
    print(response.json())
