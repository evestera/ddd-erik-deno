#!/bin/bash

if [[ -z $(kubectl get ingress ingress -o yaml | grep "serviceName: erik-deno-service") ]]
then echo "$(kubectl get ingress ingress -o yaml | sed '/^status:$/Q')
  - host: erik-deno.dossiercloud.gq
    http:
      paths:
      - path: "/*"
        backend:
          serviceName: erik-deno-service
          servicePort: 80
$(kubectl get ingress ingress -o yaml | sed -n -e '/^status:$/,$p')" | kubectl apply -f -
fi
