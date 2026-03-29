FROM neo4j:5.26.0

# Install neosemantics (n10s)
ADD --chown=neo4j:neo4j https://github.com/neo4j-labs/neosemantics/releases/download/5.26.0/neosemantics-5.26.0.jar /var/lib/neo4j/plugins/neosemantics.jar

# Install APOC Core (Ensuring it is explicitly present)
ADD --chown=neo4j:neo4j https://github.com/neo4j/apoc/releases/download/5.26.0/apoc-5.26.0-core.jar /var/lib/neo4j/plugins/apoc.jar

# Ensure permissions are correct
RUN chmod 644 /var/lib/neo4j/plugins/*.jar

# Expose ports
EXPOSE 7474 7687
